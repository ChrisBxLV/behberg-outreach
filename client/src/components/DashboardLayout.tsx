import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getAppHomeUrl, getLoginUrl, getPublicHomeUrl } from "@/const";
import { clientMatchesDefaultOperatorLogin } from "@/lib/defaultOperatorClientHint";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
  Mail,
  Settings,
  Radar,
  Target,
  Shield,
  Sun,
  Moon,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { ProfileRegistrationModal } from "@/components/ProfileRegistrationModal";
import { Button } from "./ui/button";
import { useTheme } from "@/contexts/ThemeContext";

const baseMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/app" },
  { icon: Users, label: "Contacts", path: "/app/contacts" },
  { icon: Mail, label: "Campaigns", path: "/app/campaigns" },
  { icon: Radar, label: "Signals", path: "/app/signals" },
  { icon: Target, label: "Search", path: "/app/prospecting" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];

function showSuperadminInNav(
  user:
    | {
        isPlatformOperator?: boolean;
        role?: string;
        openId?: string | null;
        email?: string | null;
        name?: string | null;
        defaultOperatorLogin?: string | null;
        accountDisabled?: boolean;
      }
    | null
    | undefined,
  defaultLoginHint: string | null | undefined,
) {
  const hint = user?.defaultOperatorLogin ?? defaultLoginHint;
  if (user?.accountDisabled) return false;
  return Boolean(
    user?.isPlatformOperator ||
      user?.role === "superadmin" ||
      clientMatchesDefaultOperatorLogin(user, hint),
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              window.location.href = getPublicHomeUrl();
            }}
          >
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ProfileRegistrationModal user={user} />
      <SidebarProvider>
        <DashboardLayoutContent>{children}</DashboardLayoutContent>
      </SidebarProvider>
    </>
  );
}

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, switchable } = useTheme();
  const { data: loginOpts } = trpc.auth.loginOptions.useQuery();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, openMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const superNav = showSuperadminInNav(user, loginOpts?.defaultAdminLogin);
  const menuItems = superNav
    ? [...baseMenuItems, { icon: Shield, label: "Superadmin", path: "/app/superadmin" }]
    : baseMenuItems;
  const activeMenuItem = menuItems.find(
    item =>
      item.path === location ||
      (item.path !== "/app" && location.startsWith(`${item.path}/`)),
  );
  const isMobileLegacy = useIsMobile();
  const idleTimeoutRef = useRef<number | null>(null);
  const logoutRef = useRef(logout);
  const mobileAutoCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  // We still keep the local breakpoint hook to render the sticky mobile header.
  // Closing the Sheet should not depend on breakpoint initialization timing.

  // Auto-close the mobile sidebar after navigation.
  useEffect(() => {
    if (!openMobile) return;
    setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Auto-close the mobile sidebar after a short idle period while open.
  useEffect(() => {
    if (!openMobile) return;

    const closeSoon = () => {
      if (mobileAutoCloseTimerRef.current) {
        window.clearTimeout(mobileAutoCloseTimerRef.current);
      }
      mobileAutoCloseTimerRef.current = window.setTimeout(() => {
        setOpenMobile(false);
      }, 12_000);
    };

    closeSoon();

    const onActivity = () => closeSoon();
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    const listenerOptions: AddEventListenerOptions = { passive: true };
    for (const evt of events) window.addEventListener(evt, onActivity, listenerOptions);

    return () => {
      for (const evt of events) window.removeEventListener(evt, onActivity, listenerOptions);
      if (mobileAutoCloseTimerRef.current) {
        window.clearTimeout(mobileAutoCloseTimerRef.current);
        mobileAutoCloseTimerRef.current = null;
      }
    };
  }, [openMobile, setOpenMobile]);

  const resetIdleTimer = useCallback(() => {
    if (typeof window === "undefined") return;
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
    }
    // 30 minutes of inactivity.
    idleTimeoutRef.current = window.setTimeout(() => {
      void logoutRef.current();
    }, 30 * 60 * 1000);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    resetIdleTimer();

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "pointerdown",
    ];
    const listenerOptions: AddEventListenerOptions = { passive: true };

    for (const evt of events) {
      window.addEventListener(evt, resetIdleTimer, listenerOptions);
    }

    const onVisibilityChange = () => {
      // When returning to the tab, treat it as activity.
      if (!document.hidden) resetIdleTimer();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, resetIdleTimer, listenerOptions);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    };
  }, [resetIdleTimer, user]);

  return (
    <>
      <div className="relative">
        <Sidebar
          collapsible="icon"
          className="border-r-0"
        >
          <SidebarHeader className="h-14 justify-center">
            <div
              className={[
                "flex items-center transition-all w-full",
                isCollapsed ? "justify-center px-0" : "gap-2 px-1.5",
              ].join(" ")}
            >
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <button
                  type="button"
                  onClick={() => setLocation(getAppHomeUrl())}
                  className="flex items-center gap-2 min-w-0 text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Go to dashboard home"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold tracking-tight truncate text-foreground">Krot</span>
                    <span className="text-xs text-primary truncate font-medium">Platform</span>
                  </div>
                </button>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-1.5 py-1">
              {menuItems.map(item => {
                const isActive =
                  location === item.path ||
                  (item.path !== "/app" && location.startsWith(`${item.path}/`));
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => {
                        setLocation(item.path);
                        // Always close the mobile Sheet after navigation.
                        setOpenMobile(false);
                      }}
                      tooltip={item.label}
                      className="font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {switchable && toggleTheme ? (
                  <>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={e => toggleTheme?.(e)}
                    >
                      {theme === "dark" ? (
                        <Sun className="mr-2 h-4 w-4" />
                      ) : (
                        <Moon className="mr-2 h-4 w-4" />
                      )}
                      <span>Switch to {theme === "dark" ? "light" : "dark"} mode</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {superNav ? (
                  <>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setLocation("/app/superadmin")}
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      <span>Superadmin console</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  onClick={() => void logout()}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      </div>

      <SidebarInset>
        {isMobileLegacy && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            {switchable && toggleTheme ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={e => toggleTheme?.(e)}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </div>
        )}
        <main className="min-w-0 flex-1 p-2 md:p-3">{children}</main>
      </SidebarInset>
    </>
  );
}
