import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type ProgressPayload = {
  id: string;
  downloaded: number;
  total: number;
};

/**
 * 3. Frontend JavaScript Snippet
 * 
 * This module demonstrates how to invoke the Rust chunk-based downloader from the UI
 * and listen to the 'download-progress' event over the Tauri IPC bridge.
 */
export async function downloadPackage(
  id: string,
  url: string,
  dest: string,
  onProgress: (percentage: number, downloaded: number, total: number) => void
) {
  // Listen to the progress event broadcasted by the Rust backend.
  const unlisten = await listen<ProgressPayload>('download-progress', (event) => {
    if (event.payload.id === id) {
      const { downloaded, total } = event.payload;
      const percentage = total > 0 ? (downloaded / total) * 100 : 0;
      onProgress(percentage, downloaded, total);
    }
  });

  try {
    // Invoke the Rust command. It will block asynchronously until the download finishes or errors.
    await invoke('download_package', { id, url, dest });
  } finally {
    // Unsubscribe from the event once the download completes or fails.
    unlisten();
  }
}

export async function runOfflineInstall(
  packageManager: 'pnpm' | 'pip',
  targetFile: string,
  projectPath: string = '.'
) {
  return await invoke<string>('run_offline_install', { packageManager, targetFile, projectPath });
}

export async function initProject(
  target: 'node' | 'python',
  projectPath: string = '.'
) {
  return await invoke<string>('init_project', { target, projectPath });
}
