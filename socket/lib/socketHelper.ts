export interface SendNotificationProps {
  userId: string;
  title: string;
  body: string;
  data: Record<string, any>;
}

import io from "./io";
const sendNotification = async (message: SendNotificationProps) => {
  if (io) {
    io.to(message.userId).emit("message", { ...message });
  }
};
export { sendNotification };
