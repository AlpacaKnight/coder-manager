interface StatusBarProps {
  lastCheckTime: string | null;
}

export function StatusBar({ lastCheckTime }: StatusBarProps) {
  const formatTime = (timestamp: string) => {
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts)) return '未知';
    const date = new Date(ts * 1000);
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
