'use server';

interface BackendResponse {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

async function postJson<T extends BackendResponse>(endpoint: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`http://localhost:3003/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    cache: 'no-store',
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as T;

  if (!response.ok || payload.success === false) {
    throw new Error(payload.error as string || `Request to ${endpoint} failed`);
  }

  return payload;
}

export async function approveLanguage(language: string) {
  return postJson('approve', { language });
}

export async function rejectLanguage(language: string) {
  return postJson('reject', { language });
}

export async function updateEnglish() {
  return postJson('update');
}
