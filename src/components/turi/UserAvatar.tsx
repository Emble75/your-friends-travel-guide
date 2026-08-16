import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, signedUrl } from "@/lib/turi";
import { cn } from "@/lib/utils";

export function UserAvatar({
  avatarPath,
  name,
  className,
}: {
  avatarPath?: string | null | undefined;
  name?: string | null | undefined;
  className?: string | undefined;
}) {
  const { data: url } = useQuery({
    queryKey: ["avatar", avatarPath],
    queryFn: () => signedUrl("avatars", avatarPath),
    enabled: !!avatarPath,
  });

  return (
    <Avatar className={cn("size-10 border border-border", className)}>
      {url ? <AvatarImage src={url} alt={name ?? "Avatar"} /> : null}
      <AvatarFallback className="bg-primary-soft text-sm font-semibold text-accent-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
