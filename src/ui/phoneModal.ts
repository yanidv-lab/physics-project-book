/// <reference types="vite/client" />
import QRCode from 'qrcode';

interface LanInfoResponse {
  port: number;
  urls: string[];
}

export class PhoneModal {
  private readonly modal = document.getElementById('phone-modal') as HTMLElement;
  private readonly tipEl = document.getElementById('phone-tip') as HTMLElement | null;
  private readonly qrBox = document.getElementById('phone-qr-box') as HTMLElement;
  private readonly urlText = document.getElementById('phone-url-text') as HTMLElement;
  private readonly altUrls = document.getElementById('phone-alt-urls') as HTMLElement;
  private readonly copyBtn = document.getElementById('phone-copy-btn') as HTMLButtonElement;
  private readonly closeBtn = document.getElementById('phone-close-btn') as HTMLButtonElement;

  private activeUrl = window.location.href;

  constructor() {
    this.closeBtn.addEventListener('click', () => this.hide());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });
    this.copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.activeUrl);
        this.copyBtn.textContent = 'Copied!';
      } catch {
        this.copyBtn.textContent = 'Select URL Above';
      }
      setTimeout(() => {
        this.copyBtn.textContent = 'Copy URL';
      }, 1600);
    });
  }

  public async show(): Promise<void> {
    this.modal.classList.remove('hidden');
    await this.loadAndRenderQr();
  }

  public hide(): void {
    this.modal.classList.add('hidden');
  }

  private async loadAndRenderQr(): Promise<void> {
    let urls: string[] = [];
    if (import.meta.env.DEV) {
      try {
        const resp = await fetch('/__lan-info');
        if (resp.ok) {
          const data = (await resp.json()) as LanInfoResponse;
          urls = data.urls ?? [];
        }
      } catch {
        // Fallback to current browser location
      }
    }

    this.activeUrl = urls[0] ?? window.location.href;
    this.urlText.textContent = this.activeUrl;

    if (this.tipEl) {
      let isLocalHost = false;
      try {
        const { hostname } = new URL(this.activeUrl, window.location.href);
        isLocalHost =
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
      } catch {
        isLocalHost = true;
      }

      this.tipEl.textContent = isLocalHost
        ? 'Scan with your phone camera (on the same Wi-Fi network) to launch the mobile-friendly 3D Physics Book:'
        : 'Scan with your phone camera from anywhere — hosted in the cloud and works even when your PC is off!';
    }

    if (urls.length > 1) {
      this.altUrls.textContent = `Other interfaces: ${urls.slice(1).join(' · ')}`;
      this.altUrls.classList.remove('hidden');
    } else {
      this.altUrls.classList.add('hidden');
    }

    try {
      const svg = await QRCode.toString(this.activeUrl, {
        type: 'svg',
        margin: 2,
        width: 200,
        color: {
          dark: '#00f0ff',
          light: '#0b1120',
        },
      });
      this.qrBox.innerHTML = svg;
    } catch {
      this.qrBox.innerHTML = '<div class="qr-fallback">Open the URL below on your phone</div>';
    }
  }
}
