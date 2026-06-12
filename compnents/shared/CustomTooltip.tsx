import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function CustomTooltip({
  trigger,
  content,
}: {
  trigger: React.ReactNode;
  content: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent className="max-w-sm">{content}</TooltipContent>
    </Tooltip>
  );
}
