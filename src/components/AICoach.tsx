import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Loader2, MessageSquare, ChevronDown, RefreshCw, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AICoachProps {
  role: string;
}

export default function AICoach({ role }: AICoachProps) {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to input box when component mounts (on mobile)
  useEffect(() => {
    // Check if user is on mobile
    const isMobile = window.innerWidth < 768;
    if (isMobile && inputRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        // Show scroll hint briefly
        setShowScrollHint(true);
        setTimeout(() => setShowScrollHint(false), 3000);
      }, 300);
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (retryMessage?: string) => {
    const messageToSend = retryMessage || input;
    if (!messageToSend.trim() || loading) return;
    
    const userMessage = messageToSend;
    if (!retryMessage) {
      setInput("");
    }
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    setLastFailedMessage(null);

    try {
      const data = await apiRequest('/api/ai/coach', 'POST', { 
        message: userMessage,
        role 
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      setLastFailedMessage(null);
    } catch (error: any) {
      console.error(error);
      setLastFailedMessage(userMessage);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: '❌ Error: Failed to get coach response. Click retry to try again.' 
      }]);
      toast({
        title: "Error",
        description: error.message || "Failed to get coach response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const retryLastMessage = () => {
    if (lastFailedMessage) {
      // Remove the error message from UI
      setMessages(prev => prev.slice(0, -1));
      sendMessage(lastFailedMessage);
    }
  };

  const quickSuggestions = [
    "What's the best way to structure my answers?",
    "What are common mistakes to avoid?",
    "How should I handle tough questions?",
    "What should I do before the interview?",
  ];

  return (
    <Card className="shadow-xl border-2">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10">
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-primary" />
          AI Interview Coach
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Get personalized tips and advice for your interview preparation
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {/* Mobile scroll hint */}
        {showScrollHint && (
          <div className="md:hidden fixed bottom-20 left-0 right-0 flex justify-center z-50 animate-bounce pointer-events-none">
            <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <ChevronDown className="w-4 h-4" />
              <span className="text-sm font-medium">Scroll down to chat</span>
            </div>
          </div>
        )}

        {/* Quick suggestions */}
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Try asking:</p>
            <div className="grid grid-cols-2 gap-2">
              {quickSuggestions.map((suggestion, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInput(suggestion);
                    // Auto-scroll to input after selecting suggestion
                    setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                  }}
                  className="text-xs justify-start h-auto py-2 px-3 text-left whitespace-normal"
                >
                  <MessageSquare className="w-3 h-3 mr-2 flex-shrink-0" />
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={messagesContainerRef} className="space-y-3 min-h-[200px] max-h-[400px] overflow-y-auto pr-2">
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No conversation yet. Ask me anything!</p>
            </div>
          ) : null}
          {messages.map((msg, idx) => {
            const isError = msg.content.includes('❌ Error:');
            return (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-lg ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-br-none' 
                    : isError
                    ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-bl-none'
                    : 'bg-muted rounded-bl-none'
                }`}>
                  <p className={`text-sm whitespace-pre-wrap ${isError ? 'text-red-900 dark:text-red-100' : ''}`}>
                    {msg.content}
                  </p>
                  {isError && lastFailedMessage && (
                    <Button
                      onClick={retryLastMessage}
                      variant="outline"
                      size="sm"
                      className="mt-2 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                      disabled={loading}
                    >
                      <RefreshCw className={`w-3 h-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted p-3 rounded-lg rounded-bl-none">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Input */}
        <div ref={inputRef} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask for interview tips..."
            disabled={loading}
            maxLength={500}
            autoFocus={false}
          />
          <Button onClick={() => sendMessage()} disabled={loading || !input.trim()}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          AI-powered coaching • {input.length}/500 characters
        </p>
      </CardContent>
    </Card>
  );
}
