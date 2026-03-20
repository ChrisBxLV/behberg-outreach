import { COOKIE_NAME } from "@shared/const";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { agentDebugLog } from "./agentDebugLog";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const url = opts.req.originalUrl ?? opts.req.url ?? "";
  if (url.includes("auth.me")) {
    const hasSessionCookie = Boolean(
      opts.req.headers.cookie?.split(";").some(part => part.trim().startsWith(`${COOKIE_NAME}=`)),
    );
    // #region agent log
    agentDebugLog({
      runId: "post-fix",
      hypothesisId: "H_CTX",
      location: "server/_core/context.ts:createContext-auth.me",
      message: "auth.me request context",
      data: { hasSessionCookie, userPresent: Boolean(user) },
    });
    // #endregion
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
