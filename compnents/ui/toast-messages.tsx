import { toast } from "sonner";

export const ToastSuccessMessage = (message: string, text?: string) => {
  if (!message) return;
  if (text) message += ` - ${text}`;
  toast.success("Success", {
    description: message,
  });
};

export const ToastErrorMessage = (error: any) => {
  if (!error) return;
  let errorMessage = "An unknown error occurred";
  let rawText: string | undefined;

  if (typeof error === "string") {
    errorMessage = error || errorMessage;
  } else if (typeof error === "object" && error !== null) {
    const responseError = error as {
      response?: { data?: { message?: string; error?: string; text?: string } };
    };

    const data = responseError.response?.data;
    rawText = data?.text;
    errorMessage =
      (data?.message as string) || (data?.error as string) || errorMessage;
  }

  if (rawText) {
    errorMessage += ` - ${rawText}`;
  }

  toast.error("Error", {
    description: errorMessage,
  });
};
