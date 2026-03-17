import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mail, CheckCircle2, XCircle, RefreshCw, ExternalLink,
  Database, Settings2, Unplug, Play, AlertCircle
} from "lucide-react";
import { useLocation } from "wouter";

export default function Settings() {
  const [location] = useLocation();
  const utils = trpc.useUtils();

  const { data: smtpConfig } = trpc.settings.getSmtpConfig.useQuery();
  const { data: appConfig } = trpc.settings.getAppConfig.useQuery();
  const { data: sheetsStatus, refetch: refetchSheets } = trpc.sheets.status.useQuery();

  const testSmtpMutation = trpc.email.testSmtp.useMutation({
    onSuccess: (r) => {
      if (r.success) {
        toast.success("SMTP connection successful! Test email sent.");
      } else {
        toast.error(`SMTP test failed: ${r.error}`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const getAuthUrlQuery = trpc.sheets.getAuthUrl.useQuery(undefined, { enabled: false });

  const disconnectSheetsMutation = trpc.sheets.disconnect.useMutation({
    onSuccess: () => { toast.success("Google Sheets disconnected"); refetchSheets(); },
    onError: (e) => toast.error(e.message),
  });

  const pushSheetsMutation = trpc.sheets.push.useMutation({
    onSuccess: (r) => { toast.success(`Pushed ${r.rowsWritten} contacts to Google Sheets`); refetchSheets(); },
    onError: (e) => toast.error(e.message),
  });

  const pullSheetsMutation = trpc.sheets.pull.useMutation({
    onSuccess: (r) => { toast.success(`Pulled ${r.imported} contacts from Google Sheets`); refetchSheets(); },
    onError: (e) => toast.error(e.message),
  });

  // Handle OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sheets_connected")) {
      toast.success("Google Sheets connected successfully!");
      refetchSheets();
      window.history.replaceState({}, "", "/settings");
    }
    if (params.get("sheets_error")) {
      toast.error(`Google Sheets error: ${params.get("sheets_error")}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  const handleConnectSheets = async () => {
    const result = await getAuthUrlQuery.refetch();
    if (result.data?.url) {
      window.location.href = result.data.url;
    } else {
      toast.error("Failed to get Google OAuth URL. Make sure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-2 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Configure your integrations and platform settings</p>
        </div>

        {/* SMTP Configuration */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Outlook SMTP</CardTitle>
                <CardDescription className="text-xs">Email sending via @behberg.com</CardDescription>
              </div>
              <div className="ml-auto">
                {smtpConfig?.configured ? (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Configured
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />Not Configured
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/20 border border-border/30">
              <div>
                <p className="text-xs text-muted-foreground">Host</p>
                <p className="text-sm font-medium mt-0.5">{smtpConfig?.host ?? "smtp.office365.com"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Port</p>
                <p className="text-sm font-medium mt-0.5">{smtpConfig?.port ?? 587}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="text-sm font-medium mt-0.5">{smtpConfig?.user || "Not set"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-300">
                <p className="font-medium mb-1">How to configure SMTP</p>
                <p>Set <code className="bg-blue-500/20 px-1 rounded">SMTP_USER</code> and <code className="bg-blue-500/20 px-1 rounded">SMTP_PASS</code> environment variables in the Secrets panel. Generate an App Password from your Microsoft account at <strong>account.microsoft.com → Security → App passwords</strong>.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => testSmtpMutation.mutate()}
                disabled={testSmtpMutation.isPending || !smtpConfig?.configured}
              >
                {testSmtpMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Test Connection
              </Button>
              {!smtpConfig?.configured && (
                <p className="text-xs text-muted-foreground self-center">Configure SMTP_USER and SMTP_PASS secrets first</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Google Sheets */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Database className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-base">Google Sheets Sync</CardTitle>
                <CardDescription className="text-xs">Bidirectional contact sync with Google Sheets</CardDescription>
              </div>
              <div className="ml-auto">
                {sheetsStatus?.connected ? (
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />Connected
                  </Badge>
                ) : (
                  <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30">
                    <XCircle className="h-3 w-3 mr-1" />Disconnected
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!sheetsStatus?.hasGoogleCredentials && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-300">
                  <p className="font-medium mb-1">Google OAuth not configured</p>
                  <p>Set <code className="bg-amber-500/20 px-1 rounded">GOOGLE_CLIENT_ID</code> and <code className="bg-amber-500/20 px-1 rounded">GOOGLE_CLIENT_SECRET</code> in the Secrets panel. Create OAuth credentials at <strong>console.cloud.google.com</strong> with the Sheets API enabled.</p>
                </div>
              </div>
            )}

            {sheetsStatus?.connected ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/20 border border-border/30">
                  <div>
                    <p className="text-xs text-muted-foreground">Spreadsheet</p>
                    <p className="text-sm font-medium mt-0.5">{sheetsStatus.spreadsheetName ?? sheetsStatus.spreadsheetId ?? "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Sync</p>
                    <p className="text-sm font-medium mt-0.5">
                      {sheetsStatus.lastSyncAt ? new Date(sheetsStatus.lastSyncAt).toLocaleString() : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sync Status</p>
                    <Badge className={`text-xs mt-0.5 ${
                      sheetsStatus.syncStatus === "idle" ? "bg-emerald-500/20 text-emerald-300" :
                      sheetsStatus.syncStatus === "error" ? "bg-red-500/20 text-red-300" :
                      sheetsStatus.syncStatus === "syncing" ? "bg-blue-500/20 text-blue-300" :
                      "bg-slate-500/20 text-slate-300"
                    }`}>{sheetsStatus.syncStatus ?? "idle"}</Badge>
                  </div>
                  {sheetsStatus.errorMessage && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Last Error</p>
                      <p className="text-xs text-red-400 mt-0.5">{sheetsStatus.errorMessage}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pushSheetsMutation.mutate({})}
                    disabled={pushSheetsMutation.isPending}
                  >
                    {pushSheetsMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                    Push to Sheets
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pullSheetsMutation.mutate()}
                    disabled={pullSheetsMutation.isPending}
                  >
                    {pullSheetsMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
                    Pull from Sheets
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Disconnect Google Sheets?")) disconnectSheetsMutation.mutate();
                    }}
                  >
                    <Unplug className="h-4 w-4 mr-2" />Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Connect your Google account to sync contacts bidirectionally with a Google Spreadsheet.
                </p>
                <Button
                  size="sm"
                  onClick={handleConnectSheets}
                  disabled={!sheetsStatus?.hasGoogleCredentials}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />Connect Google Sheets
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Info */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Settings2 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Platform Info</CardTitle>
                <CardDescription className="text-xs">Current configuration overview</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "App Base URL", value: appConfig?.appBaseUrl || "Not set" },
                { label: "SMTP", value: appConfig?.smtpConfigured ? "Configured" : "Not configured", ok: appConfig?.smtpConfigured },
                { label: "Google OAuth", value: appConfig?.googleConfigured ? "Configured" : "Not configured", ok: appConfig?.googleConfigured },
                { label: "Email Tracking", value: appConfig?.appBaseUrl ? "Enabled (pixel tracking)" : "Needs APP_BASE_URL" },
              ].map(({ label, value, ok }) => (
                <div key={label} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {ok !== undefined && (
                      ok ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <XCircle className="h-3 w-3 text-amber-400 shrink-0" />
                    )}
                    <p className="text-sm font-medium truncate">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
