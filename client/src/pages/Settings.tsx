import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mail, CheckCircle2, XCircle, RefreshCw,
  Settings2, Play, AlertCircle
} from "lucide-react";
import { useLocation } from "wouter";

export default function Settings() {
  const [location] = useLocation();
  const utils = trpc.useUtils();

  const { data: smtpConfig } = trpc.settings.getSmtpConfig.useQuery();
  const { data: appConfig } = trpc.settings.getAppConfig.useQuery();

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
