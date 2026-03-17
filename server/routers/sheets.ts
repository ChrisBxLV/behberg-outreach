import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getSheetsSync, upsertSheetsSync } from "../db";
import { getAuthUrl, exchangeCodeForTokens, pushToSheets, pullFromSheets } from "../services/sheetsSync";

export const sheetsRouter = router({
  status: protectedProcedure.query(async () => {
    const sync = await getSheetsSync();
    return {
      connected: !!sync?.accessToken,
      spreadsheetId: sync?.spreadsheetId,
      spreadsheetName: sync?.spreadsheetName,
      lastSyncAt: sync?.lastSyncAt,
      lastSyncDirection: sync?.lastSyncDirection,
      syncStatus: sync?.syncStatus,
      errorMessage: sync?.errorMessage,
      hasGoogleCredentials: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    };
  }),

  getAuthUrl: protectedProcedure.query(async () => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    }
    return { url: getAuthUrl() };
  }),

  exchangeCode: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      await exchangeCodeForTokens(input.code);
      return { success: true };
    }),

  setSpreadsheet: protectedProcedure
    .input(z.object({
      spreadsheetId: z.string(),
      spreadsheetName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await upsertSheetsSync({
        spreadsheetId: input.spreadsheetId,
        spreadsheetName: input.spreadsheetName,
      });
      return { success: true };
    }),

  push: protectedProcedure
    .input(z.object({ spreadsheetId: z.string().optional() }))
    .mutation(async ({ input }) => {
      await upsertSheetsSync({ syncStatus: "syncing" });
      try {
        const result = await pushToSheets(input.spreadsheetId);
        return { success: true, ...result };
      } catch (err: any) {
        await upsertSheetsSync({ syncStatus: "error", errorMessage: err.message });
        throw err;
      }
    }),

  pull: protectedProcedure
    .mutation(async () => {
      await upsertSheetsSync({ syncStatus: "syncing" });
      try {
        const result = await pullFromSheets();
        return { success: true, ...result };
      } catch (err: any) {
        await upsertSheetsSync({ syncStatus: "error", errorMessage: err.message });
        throw err;
      }
    }),

  disconnect: protectedProcedure
    .mutation(async () => {
      await upsertSheetsSync({
        accessToken: undefined,
        refreshToken: undefined,
        tokenExpiry: undefined,
        spreadsheetId: undefined,
        syncStatus: "idle",
      });
      return { success: true };
    }),
});
