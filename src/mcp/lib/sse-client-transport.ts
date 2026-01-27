/**
 * SSE Client Transport for MCP
 * Connects to remote MCP servers via Server-Sent Events
 */

import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import { EventSource } from "eventsource";

export interface SSEClientTransportOptions {
  url: string;
  apiKey?: string;
  timeout?: number;
}

export class SSEClientTransport implements Transport {
  private baseUrl: string;
  private apiKey?: string;
  private eventSource?: EventSource;
  public sessionId?: string;
  private axiosClient: AxiosInstance;

  constructor(options: SSEClientTransportOptions) {
    this.baseUrl = options.url.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = options.apiKey;

    // Create axios client with optional API key
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    this.axiosClient = axios.create({
      headers,
      timeout: options.timeout || 30000,
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      // Establish SSE connection
      const sseUrl = `${this.baseUrl}/sse`;
      const eventSourceOptions: any = {};

      if (this.apiKey) {
        eventSourceOptions.headers = {
          "x-api-key": this.apiKey,
        };
      }

      this.eventSource = new EventSource(sseUrl, eventSourceOptions);

      this.eventSource.onopen = () => {
        console.log("[SSE Client] Connected to remote MCP server");
        // Don't resolve immediately - wait for endpoint event with sessionId
      };

      this.eventSource.addEventListener("endpoint", (event: any) => {
        try {
          // The endpoint event contains the message URL with sessionId
          const endpointUrl = event.data;
          // Extract sessionId from URL like "/messages?sessionId=abc123"
          const match = endpointUrl.match(/sessionId=([^&]+)/);
          if (match) {
            this.sessionId = match[1];
            console.log(`[SSE Client] Session established: ${this.sessionId}`);
            if (!resolved) {
              resolved = true;
              resolve();
            }
          } else {
            console.error(
              "[SSE Client] Could not extract sessionId from endpoint:",
              endpointUrl,
            );
            if (!resolved) {
              resolved = true;
              reject(new Error("Could not extract sessionId"));
            }
          }
        } catch (error) {
          console.error("[SSE Client] Error processing endpoint event:", error);
          if (!resolved) {
            resolved = true;
            reject(error as Error);
          }
        }
      });

      this.eventSource.addEventListener("message", (event: any) => {
        try {
          const message = JSON.parse(event.data) as JSONRPCMessage;
          if (this.onmessage) {
            this.onmessage(message);
          }
        } catch (error) {
          console.error("[SSE Client] Error parsing message:", error);
        }
      });

      this.eventSource.onerror = (error: any) => {
        console.error("[SSE Client] SSE error:", error);
        const err = new Error("SSE connection error");
        if (this.onerror) {
          this.onerror(err);
        }
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error("SSE connection timeout - no session established"));
        }
      }, 10000);
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.sessionId) {
      throw new Error("SSE session not established");
    }

    try {
      await this.axiosClient.post(
        `${this.baseUrl}/messages?sessionId=${this.sessionId}`,
        message,
      );
    } catch (error: any) {
      console.error("[SSE Client] Error sending message:", error.message);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    this.sessionId = undefined;
    if (this.onclose) {
      this.onclose();
    }
    console.log("[SSE Client] Connection closed");
  }

  // Transport interface properties
  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}
