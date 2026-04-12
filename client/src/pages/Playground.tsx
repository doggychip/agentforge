import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import type { Agent, Creator, Message } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { AgentAvatar } from "@/components/AgentAvatar";
import {
  ArrowLeft, Send, Shield, Loader2, LogIn, MessageSquare,
} from "lucide-react";

export default function Playground() {
  const { id: agentId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [trialLimited, setTrialLimited] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", agentId],
    enabled: !!agentId,
  });

  const { data: creator } = useQuery<Creator>({
    queryKey: ["/api/creators", agent?.creatorId],
    enabled: !!agent?.creatorId,
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, [agentLoading]);

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      let convId = conversationId;

      // Create conversation if needed
      if (!convId) {
        const res = await apiRequest("POST", "/api/conversations", { agentId });
        const conv = await res.json();
        convId = conv.id;
        setConversationId(convId);
      }

      const res = await apiRequest("POST", `/api/conversations/${convId}/messages`, { content });
      return res.json();
    },
    onMutate: (content) => {
      setMessages(prev => [...prev, { role: "user", content }]);
      setIsTyping(true);
      setInput("");
    },
    onSuccess: (data) => {
      setIsTyping(false);
      setMessages(prev => [...prev, { role: "assistant", content: data.assistantMessage.content }]);
    },
    onError: (err: any) => {
      setIsTyping(false);
      if (err.message?.includes("TRIAL_LIMIT") || err.message?.includes("Sign up")) {
        setTrialLimited(true);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sendMessage.isPending) return;
    sendMessage.mutate(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  if (agentLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-[60vh] w-full rounded-xl" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold mb-2">Agent not found</h1>
        <Link href="/agents" className="text-primary text-sm">Browse agents</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Link href={`/agents/${agentId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <AgentAvatar name={agent.name} className="w-9 h-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground truncate">{agent.name}</h1>
            <Badge variant="secondary" className="text-[9px] uppercase tracking-wider font-medium">
              {agent.category}
            </Badge>
          </div>
          {creator && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              by {creator.name}
              {creator.verified && <Shield size={10} className="text-primary" />}
            </p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-card min-h-0">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <AgentAvatar name={agent.name} className="w-16 h-16 mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-1">{agent.name}</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              {agent.description}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {["What can you do?", "Show me an example", "How do I get started?"].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
            {!user && (
              <p className="text-xs text-muted-foreground mt-6">
                Try up to 3 messages free — no sign-up needed
              </p>
            )}
          </div>
        ) : (
          /* Message list */
          <div className="p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <AgentAvatar name={agent.name} className="w-7 h-7 shrink-0 mt-0.5" />
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>p:last-child]:mb-0">
                      {msg.content.split("\n").map((line, j) => (
                        <p key={j}>{line || "\u00A0"}</p>
                      ))}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3">
                <AgentAvatar name={agent.name} className="w-7 h-7 shrink-0 mt-0.5" />
                <div className="bg-muted rounded-xl px-3.5 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Trial limit banner */}
      {trialLimited && !user && (
        <div className="mt-3 p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
          <p className="text-sm text-foreground">
            <span className="font-medium">You've used your 3 free messages.</span>{" "}
            Sign up to keep chatting and save your conversations.
          </p>
          <Link href="/auth">
            <Button size="sm" className="shrink-0 gap-1.5">
              <LogIn size={14} />
              Sign up free
            </Button>
          </Link>
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-3 shrink-0">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={trialLimited && !user ? "Sign up to continue..." : `Message ${agent.name}...`}
              disabled={sendMessage.isPending || (trialLimited && !user)}
              rows={1}
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 max-h-32"
              style={{ minHeight: 44 }}
              onInput={(e) => {
                const el = e.target as HTMLTextAreaElement;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 128) + "px";
              }}
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0"
            disabled={!input.trim() || sendMessage.isPending || (trialLimited && !user)}
          >
            {sendMessage.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </form>
    </div>
  );
}
