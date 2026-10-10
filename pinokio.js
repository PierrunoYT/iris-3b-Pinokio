module.exports = {
  version: "5.0",
  menu: async (kernel, info) => {
    let installed = info.exists("env/.installed")
    let lite = info.exists("models/.lite")
    let running = {
      install: info.running("install.js"),
      start: info.running("start.js"),
      update: info.running("update.js"),
      reset: info.running("reset.js"),
      link: info.running("link.js"),
      lowvram: info.running("lowvram.js")
    }
    if (running.install) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Installing",
        href: "install.js",
      }]
    } else if (running.lowvram) {
      return [{ default: true, icon: "fa-solid fa-terminal", text: "Generating (Low VRAM)", href: "lowvram.js" }]
    } else if (running.reset || running.update || running.link) {
      const task = running.reset ? "reset" : running.update ? "update" : "link"
      const labels = { reset: "Resetting", update: "Updating", link: "Deduplicating" }
      return [{ default: true, icon: "fa-solid fa-terminal", text: labels[task], href: `${task}.js` }]
    } else if (installed) {
      if (running.start) {
        let local = info.local("start.js")
        if (local && local.url) {
          return [{
            default: true,
            icon: "fa-solid fa-rocket",
            text: "Open Web UI",
            href: local.url,
          }, {
            icon: 'fa-solid fa-terminal',
            text: "Terminal",
            href: "start.js",
          }]
        } else {
          return [{
            default: true,
            icon: 'fa-solid fa-terminal',
            text: "Terminal",
            href: "start.js",
          }]
        }
      } else {
        return [{
          default: !lite,
          icon: "fa-solid fa-power-off",
          text: lite ? "<div><strong>Start</strong><div>Needs the full install (depth/upscaler weights, ~20 GB VRAM)</div></div>" : "Start",
          href: "start.js",
        }, {
          default: lite,
          icon: "fa-solid fa-memory",
          text: "<div><strong>Generate (Low VRAM)</strong><div>8 GB GPUs: BF16 + block offload, text-to-image only</div></div>",
          href: "lowvram.js",
        }, {
          icon: "fa-solid fa-arrows-rotate",
          text: "Update",
          href: "update.js",
        }, {
          icon: "fa-solid fa-plug",
          text: "<div><strong>Install (Full)</strong><div>All weights, ~36 GB</div></div>",
          href: "install.js",
          params: { full: true }
        }, {
          icon: "fa-solid fa-file-zipper",
          text: "<div><strong>Save Disk Space</strong><div>Deduplicates redundant library files</div></div>",
          href: "link.js",
        }, {
          icon: "fa-regular fa-circle-xmark",
          text: "<div><strong>Reset</strong><div>Revert to pre-install state</div></div>",
          href: "reset.js",
          confirm: "Are you sure you wish to reset the app?"

        }]
      }
    } else {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "<div><strong>Install (Full)</strong><div>Generate, Depth and Upscale: ~36 GB of weights</div></div>",
        href: "install.js",
        params: { full: true }
      }, {
        icon: "fa-solid fa-memory",
        text: "<div><strong>Install (Low VRAM)</strong><div>Text-to-image only, ~12 GB of weights, for 8 GB GPUs</div></div>",
        href: "install.js",
        params: { lite: true }
      }]
    }
  }
}
