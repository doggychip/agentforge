interface AgentAvatarProps {
  name: string;
  className?: string;
}

export function AgentAvatar({ name, className = "w-9 h-9" }: AgentAvatarProps) {
  const src = `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(name)}&backgroundColor=transparent`;
  return (
    <div className={`${className} rounded-md bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden`}>
      <img
        src={src}
        alt={name}
        style={{ width: "100%", height: "100%", borderRadius: 6, objectFit: "cover" }}
      />
    </div>
  );
}
