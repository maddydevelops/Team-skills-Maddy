"use client";

import React, { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AvatarItem {
  id: string;
  name: string;
  image: string | null;
  tooltipContent: React.ReactNode | null;
  onClick?: (obj: AvatarItem) => void;
}

interface CustomAvatarGroupProps {
  avatars: AvatarItem[];
  maxShown: number;
  className?: string;
  avatarSize?: "sm" | "md" | "lg";
}

const CustomAvatarGroup: React.FC<CustomAvatarGroupProps> = ({
  avatars,
  maxShown = 5,
  className,
  avatarSize = "md",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const sizeClasses = {
    sm: "size-6",
    md: "size-8",
    lg: "size-10",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  // Generate a consistent dark color based on the avatar's name
  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-slate-700",
      "bg-gray-700",
      "bg-zinc-700",
      "bg-neutral-700",
      "bg-stone-700",
      "bg-red-700",
      "bg-orange-700",
      "bg-amber-700",
      "bg-yellow-700",
      "bg-lime-700",
      "bg-green-700",
      "bg-emerald-700",
      "bg-teal-700",
      "bg-cyan-700",
      "bg-sky-700",
      "bg-blue-700",
      "bg-indigo-700",
      "bg-violet-700",
      "bg-purple-700",
      "bg-fuchsia-700",
      "bg-pink-700",
      "bg-rose-700",
    ];

    // Use the name to generate a consistent index
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const char = name.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const shouldShowMoreButton = avatars.length > maxShown;
  const visibleAvatars = isExpanded ? avatars : avatars.slice(0, maxShown);
  const remainingCount = avatars.length - maxShown;

  const renderAvatar = (avatar: AvatarItem, index: number) => {
    const avatarColor = getAvatarColor(avatar.name);

    const avatarElement = (
      <Avatar
        key={avatar.id}
        className={cn(
          sizeClasses[avatarSize],
          "cursor-pointer border-2 border-background hover:scale-105 transition-transform duration-200",
          avatar.onClick && "hover:ring-2 hover:ring-primary/20",
          index > 0 && "-ml-2"
        )}
        onClick={() => avatar.onClick?.(avatar)}
      >
        {avatar.image ? (
          <AvatarImage src={avatar.image} alt={avatar.name} />
        ) : null}
        <AvatarFallback
          className={cn(
            avatarColor,
            "text-white font-medium",
            textSizeClasses[avatarSize]
          )}
        >
          {getInitials(avatar.name)}
        </AvatarFallback>
      </Avatar>
    );

    if (avatar.tooltipContent) {
      return (
        <Tooltip key={avatar.id}>
          <TooltipTrigger asChild>{avatarElement}</TooltipTrigger>
          <TooltipContent className="m-0 p-0 bg-transparent">
            {avatar.tooltipContent}
          </TooltipContent>
        </Tooltip>
      );
    }

    return avatarElement;
  };

  const renderMoreButton = () => {
    if (!shouldShowMoreButton) return null;

    const moreButton = (
      <Avatar
        className={cn(
          sizeClasses[avatarSize],
          "cursor-pointer border-2 border-background bg-muted hover:bg-muted/80 transition-colors duration-200 -ml-2"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <AvatarFallback
          className={cn(
            "bg-muted text-muted-foreground font-medium",
            textSizeClasses[avatarSize]
          )}
        >
          {isExpanded ? (
            <MoreHorizontal className="size-4" />
          ) : (
            `+${remainingCount}`
          )}
        </AvatarFallback>
      </Avatar>
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>{moreButton}</TooltipTrigger>
        <TooltipContent>
          {isExpanded ? "Collapse" : `Show ${remainingCount} more`}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className={cn("flex items-center", className)}>
      {visibleAvatars.map((avatar, index) => renderAvatar(avatar, index))}
      {renderMoreButton()}
    </div>
  );
};

export default CustomAvatarGroup;
