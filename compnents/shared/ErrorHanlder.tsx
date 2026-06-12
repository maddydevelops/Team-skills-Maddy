"use client";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

const ErrorHandler = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <ShieldAlert className="w-12 h-12 text-red-500" />
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            Oops! Something went wrong.
          </h1>

          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-md mx-auto">
            Please try again later. If the problem persists, please contact
            support.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ErrorHandler;
