export function botShowsUnread(bot: {
  unread?: boolean;
  tasks?: ReadonlyArray<{ unread?: boolean; archivedAt?: number }> | null;
}): boolean {
  if (!bot.tasks?.length) return Boolean(bot.unread);
  return bot.tasks.some((task) => Boolean(task.unread) && task.archivedAt === undefined);
}
