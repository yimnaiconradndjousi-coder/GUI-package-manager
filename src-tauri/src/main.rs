// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter};
use reqwest::Client;
use serde::{Serialize, Deserialize};
use std::fs::OpenOptions;
use std::io::{Seek, SeekFrom, Write};
use std::path::Path;
use futures_util::StreamExt;

#[derive(Clone, Serialize)]
struct ProgressPayload {
    id: String,
    downloaded: u64,
    total: u64,
}

#[tauri::command]
async fn run_offline_install(
    package_manager: String,
    target_file: String,
    project_path: String,
) -> Result<String, String> {
    let mut cmd = if package_manager == "pip" {
        let mut c = std::process::Command::new("pip");
        c.arg("install").arg(&target_file).arg("--no-index").arg("--find-links").arg(Path::new(&target_file).parent().unwrap_or(Path::new(".")));
        c
    } else if package_manager == "pnpm" {
        let mut c = std::process::Command::new("pnpm");
        c.arg("add").arg(&target_file);
        c
    } else {
        return Err("Unsupported package manager".into());
    };

    cmd.current_dir(project_path);

    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn init_project(target: String, project_path: String) -> Result<String, String> {
    let mut cmd = if target == "node" {
        let mut c = std::process::Command::new("pnpm");
        c.arg("init");
        c
    } else if target == "python" {
        let mut c = std::process::Command::new("python");
        c.arg("-m").arg("venv").arg("venv");
        c
    } else {
        return Err("Unknown target".into());
    };

    cmd.current_dir(project_path);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn download_package(
    app: AppHandle,
    id: String,
    url: String,
    dest: String,
) -> Result<(), String> {
    let path = Path::new(&dest);
    
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Check existing file size for resume (The Two-Step Local Staging Cache)
    let mut downloaded_bytes = 0u64;
    if path.exists() {
        if let Ok(metadata) = std::fs::metadata(&path) {
            downloaded_bytes = metadata.len();
        }
    }

    let client = Client::new();
    let mut req = client.get(&url);
    
    // Automatically inject the HTTP Range header if partially downloaded
    if downloaded_bytes > 0 {
        req = req.header("Range", format!("bytes={}-", downloaded_bytes));
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    
    let total_size = match res.content_length() {
        Some(len) => downloaded_bytes + len,
        None => return Err("Could not determine file size".into()),
    };

    if res.status().is_success() || res.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(true) // Crucial: Appends chunks to the existing .tgz or .whl file
            .open(&path)
            .map_err(|e| e.to_string())?;

        let mut stream = res.bytes_stream();
        
        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded_bytes += chunk.len() as u64;

            // Transmit progress over Tauri IPC to the React frontend
            let _ = app.emit("download-progress", ProgressPayload {
                id: id.clone(),
                downloaded: downloaded_bytes,
                total: total_size,
            });
        }
    } else if res.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        // Already fully downloaded
        let _ = app.emit("download-progress", ProgressPayload {
            id: id.clone(),
            downloaded: downloaded_bytes,
            total: downloaded_bytes,
        });
    } else {
        return Err(format!("Download failed with HTTP status: {}", res.status()));
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![download_package, run_offline_install, init_project])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
