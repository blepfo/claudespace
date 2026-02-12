export interface CreateThreadRequest {
  pane_id: string;
  name: string;
}

export interface NotifyRequest {
  pane_id: string;
  name: string;
  message: string;
  type: "notification" | "stop";
}

export interface CloseRequest {
  pane_id: string;
  name: string;
}

export interface PaneMapping {
  pane_id: string;
  name: string;
  thread_ts: string;
  channel_id: string;
  created_at: number;
}
