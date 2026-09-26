/** WebPush port: Peringatan Staf to each Perangkat Push, alongside email. */
export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushNotification {
  title: string;
  body: string;
  /** Where tapping the notification opens. */
  url?: string;
}

export interface PushResult {
  delivered: boolean;
  /** The subscription is gone (HTTP 404/410) and should be forgotten. */
  subscriptionGone: boolean;
}

export interface WebPush {
  send(push: { subscription: PushSubscription; notification: PushNotification }): Promise<PushResult>;
}
