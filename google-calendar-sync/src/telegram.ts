/**
 * Telegram notification helper for error alerts.
 */

/** Send an error notification to Telegram. Never throws — logs errors instead. */
export async function sendTelegramError(
  botToken: string,
  chatId: string,
  message: string,
): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    if (!response.ok) {
      console.error(
        `Telegram API error: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error: unknown) {
    console.error(
      `Failed to send Telegram notification: ${(error as Error).message}`,
    );
  }
}
