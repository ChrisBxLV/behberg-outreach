import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import InsideSoftwareLanding from "./pages/InsideSoftwareLanding";
import MarketingLanding from "./pages/MarketingLanding";
import Home from "./pages/Home";
import Contacts from "./pages/Contacts";
import Campaigns from "./pages/Campaigns";
import CampaignDetail from "./pages/CampaignDetail";
import Signals from "./pages/Signals";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import LoginVerify from "./pages/LoginVerify";
import SignUp from "./pages/SignUp";

function Router() {
  return (
    <Switch>
      <Route path="/" component={InsideSoftwareLanding} />
      <Route path="/home" component={MarketingLanding} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={SignUp} />
      <Route path="/login/verify" component={LoginVerify} />
      <Route path="/app" component={Home} />
      <Route path="/app/contacts" component={Contacts} />
      <Route path="/app/campaigns" component={Campaigns} />
      <Route path="/app/signals" component={Signals} />
      <Route path="/app/campaigns/:id" component={CampaignDetail} />
      <Route path="/app/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors theme="dark" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
