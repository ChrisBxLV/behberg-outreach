import cron from "node-cron";
import { getDb } from "../db";
import {
  getDueEmailJobs, getSequenceSteps, updateCampaignContact,
  getEmailLogsByContact, getCampaignStats, updateCampaign
} from "../db";
import { sendEmail, interpolateTemplate } from "./emailService";
import { generatePersonalizedEmail } from "./llmPersonalization";
import type { Contact, Campaign, SequenceStep } from "../../drizzle/schema";

let schedulerRunning = false;

export function startScheduler() {
  const disableSchedulerRaw = process.env.DISABLE_SCHEDULER ?? "";
  const disableScheduler = disableSchedulerRaw.trim().toLowerCase();
  const schedulerDisabled =
    disableScheduler === "1" || disableScheduler === "true" || disableScheduler === "yes";

  if (schedulerDisabled) {
    console.log(`[Scheduler] Not starting; DISABLE_SCHEDULER=${JSON.stringify(disableSchedulerRaw)}`);
    return;
  }

  if (schedulerRunning) return;
  schedulerRunning = true;

  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    await processEmailQueue();
  });

  console.log("[Scheduler] Email sequence scheduler started (every 5 minutes)");
}

export async function processEmailQueue(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const dueJobs = await getDueEmailJobs();

    for (const job of dueJobs) {
      try {
        await processContactStep(job.cc, job.contact, job.campaign);
        processed++;
      } catch (err: any) {
        console.error(`[Scheduler] Error processing job for contact ${job.contact.id}:`, err.message);
        errors++;
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Queue processing error:", err.message, err.code ?? '', err.sqlMessage ?? '');
  }

  return { processed, errors };
}

async function processContactStep(
  cc: { id: number; currentStep: number | null; campaignId: number; contactId: number },
  contact: Contact,
  campaign: Campaign
) {
  const steps = await getSequenceSteps(campaign.id);
  if (!steps.length) return;

  const currentStepIndex = cc.currentStep ?? 0;
  const nextStep = steps[currentStepIndex];

  if (!nextStep) {
    // Sequence complete
    await updateCampaignContact(cc.id, { status: "completed", completedAt: new Date(), nextSendAt: null });
    return;
  }

  // Check condition
  const shouldSend = await evaluateStepCondition(nextStep, contact, campaign.id);
  if (!shouldSend) {
    // Skip this step, advance to next
    const afterNext = steps[currentStepIndex + 1];
    if (afterNext) {
      const nextSendAt = calculateNextSendAt(afterNext);
      await updateCampaignContact(cc.id, { currentStep: currentStepIndex + 1, nextSendAt });
    } else {
      await updateCampaignContact(cc.id, { status: "completed", completedAt: new Date(), nextSendAt: null });
    }
    return;
  }

  // Idempotency guard: if we already sent (or queued) this step for this enrollment,
  // don't generate duplicates on retries/restarts.
  {
    const logs = await getEmailLogsByContact(contact.id);
    const existing = logs.find(
      l =>
        l.campaignContactId === cc.id &&
        l.sequenceStepId === nextStep.id &&
        (l.status === "sent" || l.status === "queued")
    );

    if (existing) {
      // If it was already sent, advance the sequence as if this send succeeded.
      if (existing.status === "sent") {
        const nextStepIndex = currentStepIndex + 1;
        const afterNext = steps[nextStepIndex];

        if (afterNext) {
          const nextSendAt = calculateNextSendAt(afterNext);
          await updateCampaignContact(cc.id, { currentStep: nextStepIndex, nextSendAt });
        } else {
          await updateCampaignContact(cc.id, {
            status: "completed",
            completedAt: new Date(),
            nextSendAt: null,
          });
        }
      }

      return;
    }
  }

  // Personalize email
  let subject = interpolateTemplate(nextStep.subject, contact);
  let body = interpolateTemplate(nextStep.bodyTemplate, contact);

  if (nextStep.useLlmPersonalization) {
    try {
      const personalized = await generatePersonalizedEmail({
        contact,
        stepType: nextStep.stepType,
        baseSubject: subject,
        baseBody: body,
      });
      subject = personalized.subject;
      body = personalized.body;
    } catch (err: any) {
      console.warn("[Scheduler] LLM personalization failed, using template:", err.message);
    }
  }

  // Determine base URL for tracking pixel
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  // Send email
  const result = await sendEmail({
    contact,
    campaign,
    step: nextStep,
    campaignContactId: cc.id,
    subject,
    body,
    baseUrl,
  });

  if (result.success) {
    // Advance to next step
    const nextStepIndex = currentStepIndex + 1;
    const afterNext = steps[nextStepIndex];

    if (afterNext) {
      const nextSendAt = calculateNextSendAt(afterNext);
      await updateCampaignContact(cc.id, { currentStep: nextStepIndex, nextSendAt });
    } else {
      await updateCampaignContact(cc.id, { status: "completed", completedAt: new Date(), nextSendAt: null });
    }
  }
}

async function evaluateStepCondition(
  step: SequenceStep,
  contact: Contact,
  campaignId: number
): Promise<boolean> {
  if (step.condition === "always") return true;

  const emailLogs = await getEmailLogsByContact(contact.id);
  const campaignLogs = emailLogs.filter(l => l.campaignId === campaignId);

  const hasOpened = campaignLogs.some(l => l.openedAt != null);
  const hasReplied = campaignLogs.some(l => l.repliedAt != null);

  switch (step.condition) {
    case "not_opened":
      return !hasOpened;
    case "opened_no_reply":
      return hasOpened && !hasReplied;
    case "not_replied":
      return !hasReplied;
    default:
      return true;
  }
}

function calculateNextSendAt(step: SequenceStep): Date {
  const now = new Date();
  const delayMs = ((step.delayDays ?? 0) * 24 * 60 + (step.delayHours ?? 0) * 60) * 60 * 1000;
  return new Date(now.getTime() + Math.max(delayMs, 60000)); // Minimum 1 minute
}

export async function launchCampaign(campaignId: number, contactIds: number[]): Promise<void> {
  const { enrollContactsInCampaign, getSequenceSteps: getSteps } = await import("../db");
  const { campaigns, campaignContacts } = await import("../../drizzle/schema");
  const { eq, inArray } = await import("drizzle-orm");

  await enrollContactsInCampaign(campaignId, contactIds);

  const steps = await getSteps(campaignId);
  if (!steps.length) throw new Error("Campaign has no sequence steps");

  const firstStep = steps[0];
  const firstSendAt = calculateNextSendAt(firstStep);

  // Activate all enrolled contacts
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(campaignContacts)
    .set({ status: "active", currentStep: 0, nextSendAt: firstSendAt })
    .where(eq(campaignContacts.campaignId, campaignId));

  await db.update(campaigns)
    .set({ status: "active" })
    .where(eq(campaigns.id, campaignId));
}
