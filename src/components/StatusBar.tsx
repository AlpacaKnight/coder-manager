interface StatusBarProps {
  lastCheckTime: string | null;
}

export function StatusBar({ lastCheckTime }: StatusBarProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleString();
  };

  return (
    <footer className="status-bar">
      <div className="last-check">
        {lastCheckTime ? `最后检查: ${formatTime(lastCheckTime)}` : '尚未检查更新'}
      </div>
    </footer>
  );
}
