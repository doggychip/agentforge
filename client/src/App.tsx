import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/use-auth";
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
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/agents" component={Agents} />
        <Route path="/agents/:id" component={AgentDetail} />
        <Route path="/creators" component={Creators} />
        <Route path="/creators/:id" component={CreatorDetail} />
        <Route path="/feed" component={Feed} />
        <Route path="/posts/:id" component={PostDetail} />
        <Route path="/new-post" component={NewPost} />
        <Route path="/become-creator" component={BecomeCreator} />
        <Route path="/profile" component={Profile} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/auth" component={Auth} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
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
  );
}

export default App;
