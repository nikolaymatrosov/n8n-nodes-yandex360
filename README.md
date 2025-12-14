
![Banner](./assets/yc_n8n.svg)

# n8n-nodes-yandex360 Package Description

Integration package for working with Yandex 360 services in n8n.

## Table of Contents

- [Available Nodes](#available-nodes)
  - [Yandex 360 Disk](#yandex-360-disk)
  - [Yandex 360 Disk Trigger](#yandex-360-disk-trigger)
- [Installation](#installation)
- [Credentials](#credentials)
- [Compatibility](#compatibility)
- [Resources](#resources)

---

## Available Nodes

### Yandex 360 Disk

Interact with Yandex 360 Disk storage - upload, download, manage files and folders.

**File Operations:**
- **Upload**: Upload binary data from workflow to Yandex Disk
- **Download**: Download files from Yandex Disk as binary data
- **Delete**: Delete files (to trash or permanently)
- **Copy**: Copy files to another location
- **Move**: Move files to another location
- **Get Info**: Retrieve file metadata
- **Publish**: Make files publicly accessible and get public link
- **Unpublish**: Remove public access from files

**Folder Operations:**
- **Create**: Create new folders
- **List**: List folder contents with pagination and sorting
- **Delete**: Delete folders (to trash or permanently)
- **Get Info**: Retrieve folder metadata
- **Publish**: Make folders publicly accessible
- **Unpublish**: Remove public access from folders

**Features:**
- Binary data support for file operations
- Async operation handling (copy, move, delete)
- Configurable "wait for completion" for long-running operations
- Comprehensive error handling with actionable messages
- OAuth 2.0 authentication

### Yandex 360 Disk Trigger

Monitor Yandex 360 Disk for file and folder changes.

**Trigger Events:**
- File or folder created
- File or folder updated

**Features:**
- Monitor entire disk or specific path
- Filter by file type (document, image, video, audio, archive)
- Configurable polling limits
- Real-time change detection

---

## Installation

### Community Nodes (Recommended)

1. Open n8n
2. Go to **Settings** > **Community Nodes**
3. Select **Install**
4. Enter `@nikolaymatrosov/n8n-nodes-yandex360`
5. Click **Install**

### Manual Installation

```bash
npm install @nikolaymatrosov/n8n-nodes-yandex360
```

---

## Credentials

### Yandex 360 OAuth2 API

To use these nodes, you need a Yandex 360 OAuth token.

**Setup:**
1. Go to [Yandex OAuth](https://yandex.com/dev/id/doc/en/)
2. Create an application and get your OAuth token
3. In n8n, create new credentials of type "Yandex 360 OAuth2 API"
4. Paste your OAuth token

---

## Compatibility

- n8n version: 1.0.0 or later
- Node.js: 22.15.0 or later

---

## Resources

- [n8n Documentation](https://docs.n8n.io/)
- [Yandex 360 Disk API Documentation](https://yandex.com/dev/disk/rest/)
- [Yandex OAuth Documentation](https://yandex.com/dev/id/doc/en/)
- [GitHub Repository](https://github.com/nikolaymatrosov/n8n-nodes-yandex360)

---
