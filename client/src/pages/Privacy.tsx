import { Button } from "@/components/ui/button";
import { getPublicHomeUrl } from "@/const";
import { ArrowLeft } from "lucide-react";
import { Streamdown } from "streamdown";
import { useLocation } from "wouter";

const PRIVACY_POLICY_MD = `# Privacy Policy

**Effective Date:** [Effective Date]  
**Last Updated:** [Last Updated]  
**Company:** [Company Legal Name]  
**Address:** [Company Address]  
**Email:** privacy@krot.io  
**Opt-Out Form:** [Opt-Out Form URL]

## 1. Introduction

This Privacy Policy describes how **Krot** (“**Krot**,” “**we**,” “**our**,” or “**us**”) collects, uses, discloses, and otherwise processes information in connection with our websites, platform, applications, APIs, and related services (collectively, the “**Services**”).

This policy applies to information we process:
- when you visit our websites or use the Services as an end user or administrator;
- when our customers use the Services to upload, verify, enrich, organize, and act on business contact data; and
- when we process business contact data about individuals in a professional context (for example, work email addresses and business profile information).

## 2. Information We Collect

We collect information from and about you and others in a business context, including the categories below.

### 2.1 Information users provide

Information you (or your organization) may provide includes:
- **Account and profile information** (e.g., name, business email address, password or authentication credentials, role, and workspace settings).
- **Billing and subscription information** (e.g., billing contact details, payment-related data processed by our payment providers, subscription plan details, invoices, and tax information where applicable).
- **Support and communications** (e.g., messages to support, feedback, requests, and other communications).
- **Configuration and content** you submit to the Services (e.g., lists, campaign settings, suppression preferences, and workflow configuration).

### 2.2 Business contact data processed

Our Services may process **business contact data** in connection with email verification, lead enrichment, prospecting workflows, and related features. Depending on the feature used and data provided, this may include:
- **Identifiers and professional details** (e.g., name, work email address, job title, employer/company, department, seniority, and business phone number).
- **Business profile information** (e.g., company domain, industry, location, and publicly available professional profile URLs).
- **Enrichment and verification metadata** (e.g., validation results, deliverability indicators, risk signals, and associated timestamps).

### 2.3 Usage, log, and device data

When you access or use the Services, we collect information such as:
- **Usage data** (e.g., features used, actions taken, pages viewed, and the dates/times of access).
- **Log data** (e.g., IP address, request identifiers, error logs, and diagnostic information).
- **Device and browser data** (e.g., device type, operating system, browser type, and language settings).

### 2.4 Cookies and tracking technologies

We and our service providers use cookies and similar technologies (such as local storage and pixels) to provide, secure, personalize, and analyze the Services. See **Section 8 (Cookies Policy)** for details.

## 3. How We Use Information

We use information we collect for purposes that include:

### 3.1 Service delivery

To operate, maintain, and provide the Services, including:
- creating and managing accounts and workspaces;
- processing requests and transactions;
- enabling core functionality such as list management, workflows, integrations, and APIs; and
- providing customer support and responding to inquiries.

### 3.2 Email verification

To provide email verification capabilities, including:
- validating formatting and deliverability signals;
- identifying risk patterns and potential abuse; and
- providing verification results to customers through the Services and APIs.

### 3.3 Lead enrichment and prospecting workflows

To provide enrichment and workflow features, including:
- appending and normalizing business contact attributes;
- improving data quality, deduplication, and matching; and
- supporting customer-managed prospecting workflows.

### 3.4 Fraud prevention and security

To protect the Services, users, and third parties, including:
- detecting and preventing fraud, abuse, and suspicious activity;
- enforcing usage policies and contractual terms; and
- securing accounts, infrastructure, and communications.

### 3.5 Analytics and product improvement

To understand usage and improve the Services, including:
- measuring performance and reliability;
- developing new features;
- debugging and quality assurance; and
- generating aggregated or de-identified analytics (where permitted).

### 3.6 Legal compliance

To comply with legal obligations and respond to lawful requests, including:
- maintaining appropriate records;
- handling privacy rights requests; and
- establishing, exercising, or defending legal claims.

## 4. Legal Bases for Processing (GDPR)

Where the **GDPR** or similar laws apply, our legal bases for processing may include:
- **Performance of a contract**: to provide the Services as agreed with our customers or with you.
- **Legitimate interests**: to operate, secure, and improve the Services; prevent fraud; maintain reliability; and support B2B verification, enrichment, and prospecting capabilities requested by customers, balanced against your rights and interests.
- **Compliance with a legal obligation**: to meet applicable legal requirements.
- **Consent**: where required by law for specific processing activities (for example, certain cookies or marketing communications), which you may withdraw at any time.

## 5. Sources of Data

We may obtain information from the following sources:
- **Direct collection** from users and customers (including administrators and authorized users).
- **Public sources** that make business information available (e.g., company websites and publicly available professional information).
- **Third-party providers** that supply business contact, enrichment, or verification-related data.
- **Customer-uploaded data** (e.g., lists and CSV uploads).
- **Integrations** enabled by customers or users (e.g., connected mailboxes, identity providers, and third-party tools).

## 6. Sharing of Information

We may disclose information in the following circumstances:

### 6.1 Service providers

We share information with vendors and service providers that process information on our behalf to help us provide the Services (for example, hosting, storage, email delivery, analytics, customer support tooling, and security monitoring).

### 6.2 Customers using the platform

When our customers use the Services, we may process and make available information (including business contact data and verification/enrichment outputs) **as directed by the customer**, including to the customer’s authorized users.

### 6.3 Legal disclosures

We may disclose information if we believe in good faith that disclosure is required by law, regulation, legal process, or governmental request, or is necessary to protect the rights, property, or safety of Krot, our users, or others.

### 6.4 Corporate transactions

We may share information in connection with a corporate transaction, such as a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets. Any disclosure will be subject to appropriate confidentiality and security measures.

### 6.5 No sale for money

**We do not sell personal information for money.**

## 7. Privacy Rights

Depending on your location and applicable law, you may have rights regarding your personal data. These may include:
- **Access**: request access to personal data we hold about you.
- **Correction**: request correction of inaccurate or incomplete data.
- **Deletion**: request deletion of certain data, subject to legal and operational exceptions.
- **Objection**: object to certain processing, including processing based on legitimate interests.
- **Restriction**: request restriction of processing in certain circumstances.
- **Portability**: request a portable copy of certain data.

We may need to verify your identity and/or authority (for example, if you are acting on behalf of an organization) before responding.

### 7.1 California privacy rights (CCPA/CPRA)

If you are a California resident, you may have the right to request information about our collection, use, and disclosure of personal information; request deletion; request correction; and opt out of certain processing as defined by applicable law. We will not discriminate against you for exercising your rights.

### 7.2 Business contact opt-out rights

If your business contact information appears in or is processed by our Services, you may request to opt out. You may submit an opt-out request using: **[Opt-Out Form URL]**.

Upon a verified opt-out request:

**“We will remove your profile from our services and retain your email only to store and honor your opt-out preference.”**

## 8. Cookies Policy

We use cookies and similar technologies for:
- **Strictly necessary purposes** (e.g., authentication, security, and load balancing).
- **Preferences** (e.g., language and settings).
- **Analytics** (e.g., understanding how the Services are used and improving performance).

You can control cookies through your browser settings. If you disable cookies, parts of the Services may not function properly.

## 9. Data Retention

We retain information for as long as reasonably necessary to:
- provide the Services and maintain business records;
- comply with legal obligations;
- resolve disputes and enforce agreements; and
- maintain suppression lists and opt-out preferences.

Retention periods vary depending on data type, customer instructions, contractual requirements, and applicable law.

## 10. Security Measures

We maintain administrative, technical, and organizational measures designed to protect information, including access controls, encryption in transit, and monitoring for suspicious activity. No method of transmission or storage is completely secure, and security measures cannot guarantee absolute protection.

## 11. International Transfers

We may transfer information to countries other than your country of residence. Where required, we rely on lawful transfer mechanisms such as **Standard Contractual Clauses (SCCs)** and other legally recognized safeguards.

## 12. Third-Party Integrations

The Services may allow you to connect third-party integrations (for example, mailbox providers, identity providers, and other tools). When enabled, information may be shared with or obtained from those third parties as part of the integration. Third-party services process information according to their own policies and terms.

## 13. Children’s Privacy

The Services are intended for business use and are not directed to children. We do not knowingly collect personal information from children.

## 14. Changes to This Policy

We may update this Privacy Policy from time to time. We will post the updated policy and update the “Last Updated” date above.

## 15. Contact Information

If you have questions or wish to exercise your privacy rights, contact us at **privacy@krot.io**.

## 16. Additional Disclosures for Email Verification Services

Email addresses submitted to the Services for verification are processed **solely for verification purposes** (including deliverability and risk assessment) and are **not used for marketing** by Krot unless separately authorized by the submitting customer or user through a distinct lawful basis.

## Optional: AI / LLM Use

**Customer data is not used to train AI models without explicit consent.**

## Optional: Data Processing Addendum (DPA)

We make a Data Processing Addendum (DPA) available to customers upon request where required for their use of the Services.

## Optional: Subprocessor Disclosures

We may maintain a list of subprocessors used to provide the Services and make it available upon request.

## Optional: GDPR Article 14 Notice (Sourced Business Contacts)

Where we obtain business contact information from sources other than the data subject, and where required by law, we provide Article 14 disclosures, including the categories of personal data, the sources, the purposes of processing, and information about rights and how to exercise them.`;

export default function Privacy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex justify-start mb-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => setLocation(getPublicHomeUrl())}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to home
          </Button>
        </div>

        <article className="prose prose-invert max-w-none">
          <Streamdown>{PRIVACY_POLICY_MD}</Streamdown>
        </article>
      </div>
    </div>
  );
}

