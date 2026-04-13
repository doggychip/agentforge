import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";
import { ClerkProvider } from "@clerk/clerk-react";

// Clerk publishable key — safe to hardcode (it's a public key)
const CLERK_PUBLISHABLE_KEY = "pk_test_Zmx5aW5nLXNsb3RoLTMuY2xlcmsuYWNjb3VudHMuZGV2JA";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import Agents from "@/pages/Agents";
import AgentDetail from "@/pages/AgentDetail";
import Creators from "@/pages/Creators";
import CreatorDetail from "@/pages/CreatorDetail";
import Auth from "@/pages/Auth";
import Feed from "@/pages/Feed";
import PostDetail from "@/pages/PostDetail";
import NewPost from "@/pages/NewPost";
import BecomeCreator from "@/pages/BecomeCreator";
import Profile from "@/pages/Profile";
import Dashboard from "@/pages/Dashboard";
import ApiKeys from "@/pages/ApiKeys";
import ApiDocs from "@/pages/ApiDocs";
import ForCreators from "@/pages/ForCreators";
import ResetPassword from "@/pages/ResetPassword";
import Pricing from "@/pages/Pricing";
import Playground from "@/pages/Playground";
import Discover from "@/pages/Discover";
import CreatorDashboard from "@/pages/CreatorDashboard";
import PublishAgent from "@/pages/PublishAgent";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={ForCreators} />
        <Route path="/explore" component={Home} />
        <Route path="/discover" component={Discover} />
        <Route path="/agents" component={Agents} />
        <Route path="/agents/:id" component={AgentDetail} />
        <Route path="/playground/:id" component={Playground} />
        <Route path="/creators" component={Creators} />
        <Route path="/creators/:id" component={CreatorDetail} />
        <Route path="/feed" component={Feed} />
        <Route path="/posts/:id" component={PostDetail} />
        <Route path="/new-post" component={NewPost} />
        <Route path="/become-creator" component={BecomeCreator} />
        <Route path="/profile" component={Profile} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/settings/api-keys" component={ApiKeys} />
        <Route path="/docs" component={ApiDocs} />
        <Route path="/for-creators" component={ForCreators} />
        <Route path="/auth" component={Auth} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/creator-dashboard" component={CreatorDashboard} />
        <Route path="/publish" component={PublishAgent} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider>
            <AuthProvider>
              <Toaster />
              <Router hook={useHashLocation}>
                <AppRouter />
              </Router>
            </AuthProvider>
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
