import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Mail, BarChart3, TrendingUp, ArrowRight, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

function StatCard({ title, value, sub, icon: Icon, color }: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover:border-primary/30 transition-colors">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold mt-1 text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: contactsData } = trpc.contacts.list.useQuery({ limit: 1 });
  const { data: campaigns } = trpc.campaigns.list.useQuery();

  const totalContacts = contactsData?.total ?? 0;
  const activeCampaigns = campaigns?.filter(c => c.status === "active").length ?? 0;
  const totalSent = campaigns?.reduce((sum, c) => sum + (c.sentCount ?? 0), 0) ?? 0;
  const totalOpens = campaigns?.reduce((sum, c) => sum + (c.openCount ?? 0), 0) ?? 0;
  const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
  const recentCampaigns = campaigns?.slice(0, 5) ?? [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      case "draft": return "bg-slate-500/20 text-slate-300 border-slate-500/30";
      case "paused": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "completed": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      default: return "bg-slate-500/20 text-slate-300";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 p-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-muted-foreground mt-1">Here's an overview of your outreach pipeline.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/app/contacts")}
            >
              <Users className="h-4 w-4 mr-2" />Contacts
            </Button>
            <Button
              size="sm"
              onClick={() => setLocation("/app/campaigns")}
              className="bg-primary text-primary-foreground"
            >
              <Mail className="h-4 w-4 mr-2" />New Campaign
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Contacts" value={totalContacts.toLocaleString()} sub="in pipeline" icon={Users} color="bg-blue-500/20 text-blue-400" />
          <StatCard title="Active Campaigns" value={activeCampaigns} sub={`${campaigns?.length ?? 0} total`} icon={Mail} color="bg-primary/20 text-primary" />
          <StatCard title="Emails Sent" value={totalSent.toLocaleString()} sub="across all campaigns" icon={BarChart3} color="bg-purple-500/20 text-purple-400" />
          <StatCard title="Open Rate" value={`${openRate}%`} sub={`${totalOpens} opens`} icon={TrendingUp} color="bg-emerald-500/20 text-emerald-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Recent Campaigns</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/app/campaigns")}
                className="text-primary hover:text-primary"
              >
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentCampaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No campaigns yet</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => setLocation("/app/campaigns")}
                  >
                    Create your first campaign
                  </Button>
                </div>
              ) : (
                recentCampaigns.map(campaign => (
                  <div key={campaign.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setLocation(`/app/campaigns/${campaign.id}`)}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{campaign.sentCount ?? 0} sent · {campaign.openCount ?? 0} opens</p>
                    </div>
                    <Badge className={`text-xs border ${getStatusColor(campaign.status)} ml-3 shrink-0`}>{campaign.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { icon: Users, color: "bg-blue-500/20 text-blue-400", title: "Import Contacts", sub: "Upload Apollo/LinkedIn CSV export", path: "/app/contacts" },
                { icon: Mail, color: "bg-primary/20 text-primary", title: "Build a Sequence", sub: "Create multi-step email campaigns", path: "/app/campaigns" },
                { icon: CheckCircle2, color: "bg-emerald-500/20 text-emerald-400", title: "Configure Integrations", sub: "Set up SMTP and platform settings", path: "/app/settings" },
              ].map(({ icon: Icon, color, title, sub, path }) => (
                <button key={path} onClick={() => setLocation(path)} className="w-full flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left group">
                  <div className={`p-2 rounded-lg ${color} transition-colors`}><Icon className="h-4 w-4" /></div>
                  <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{sub}</p></div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
