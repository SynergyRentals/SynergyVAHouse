import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface WebSocketContextType {
  isConnected: boolean;
  sendMessage: (message: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = () => {
    try {
      // Create WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        // Attempt to reconnect if it wasn't a clean close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, timeout);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setIsConnected(false);
    }
  };

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'task_updated':
        // Invalidate task queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks', message.taskId] });
        
        if (message.data?.status === 'DONE') {
          toast({
            title: "Task Completed",
            description: `${message.data.title} has been marked as complete.`,
          });
        }
        break;

      case 'sla_breach':
        // Invalidate SLA-related queries
        queryClient.invalidateQueries({ queryKey: ['/api/tasks', { slaBreached: 'true' }] });
        
        toast({
          title: "SLA Breach Alert",
          description: `Task "${message.data?.title}" has breached its SLA.`,
          variant: "destructive",
        });
        break;

      case 'task_created':
        // Invalidate all task queries
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        
        if (message.data?.sourceKind === 'conduit' || message.data?.sourceKind === 'suiteop') {
          toast({
            title: "New Task from System",
            description: `A new ${message.data.category} task has been created.`,
          });
        }
        break;

      case 'followup_reminder':
        toast({
          title: "Follow-up Reminder",
          description: `Don't forget to update on: ${message.data?.title}`,
        });
        break;

      case 'daily_brief':
        // Refresh dashboard stats
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/stats'] });
        break;

      case 'metrics_updated':
        // Refresh analytics data
        queryClient.invalidateQueries({ queryKey: ['/api/metrics'] });
        break;

      case 'user_status_changed':
        // Refresh team status
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  };

  const sendMessage = (message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, []);

  // Ping/pong to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendMessage({ type: 'ping' });
      }
    }, 30000); // Ping every 30 seconds

    return () => clearInterval(pingInterval);
  }, [isConnected]);

  const contextValue: WebSocketContextType = {
    isConnected,
    sendMessage,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}
