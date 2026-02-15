export interface CreateThreadRequest {
  pane_id: string;
  name: string;
  session: string;
}

export interface ConnectRequest {
  pane_id: string;
  name: string;
  session: string;
}

export interface NotifyRequest {
  pane_id: string;
  name: string;
  session: string;
  message: string;
  type: "notification" | "stop";
}

export interface CloseRequest {
  pane_id: string;
  name: string;
  session: string;
  permanent?: boolean;
}

export interface PaneMapping {
  pane_id: string;
  name: string;
  session: string;
  thread_ts: string;
  channel_id: string;
  created_at: number;
}

export interface ThreadRecord {
  name: string;
  session: string;
  thread_ts: string;
  channel_id: string;
}
