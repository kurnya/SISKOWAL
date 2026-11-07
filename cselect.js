// Dropdown kustom untuk semua <select> di dalam .field-shell. <select> asli tetap ada (tersembunyi) dan
// tetap jadi sumber nilai, sehingga kode lain yang membaca/mengisi select.value atau mengganti option
// tidak perlu diubah. Aktif di semua perangkat (mouse maupun layar sentuh) agar tampilannya seragam.
(function () {
  const nilaiAsli = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  const disabledAsli = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "disabled");
  let terbuka = null; // instance dropdown yang sedang terbuka

  function bangun(select) {
    const shell = select.parentElement;
    shell.classList.add("cselect");
    select.classList.add("cselect-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const id = select.id || "cs" + Math.random().toString(36).slice(2, 7);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id + "_btn";
    btn.className = "cselect-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", id + "_list");
    const teks = document.createElement("span");
    teks.className = "cselect-text";
    btn.appendChild(teks);

    const list = document.createElement("ul");
    list.id = id + "_list";
    list.className = "cselect-list hidden";
    list.setAttribute("role", "listbox");

    shell.insertBefore(btn, select);
    shell.appendChild(list);
    // Label yang menunjuk ke select kini menunjuk ke tombol, jadi klik label membuka dropdown.
    if (select.id) document.querySelectorAll(`label[for="${select.id}"]`).forEach((l) => l.setAttribute("for", btn.id));

    let aktif = 0;
    let ketikan = "";
    let ketikanTimer = null;

    function tandaiAktif(gulir) {
      [...list.children].forEach((li, i) => li.classList.toggle("aktif", i === aktif));
      const li = list.children[aktif];
      if (li) {
        btn.setAttribute("aria-activedescendant", li.id);
        if (gulir) li.scrollIntoView({ block: "nearest" });
      }
    }

    function render() {
      const terpilih = select.selectedOptions[0];
      teks.textContent = terpilih ? terpilih.textContent : "";
      btn.disabled = select.disabled;
      list.innerHTML = "";
      [...select.options].forEach((o, i) => {
        const li = document.createElement("li");
        li.id = `${id}_o${i}`;
        li.setAttribute("role", "option");
        li.dataset.i = i;
        li.textContent = o.textContent;
        if (o.selected) li.setAttribute("aria-selected", "true");
        list.appendChild(li);
      });
      if (select.disabled && terbuka === inst) tutup();
      if (terbuka === inst) tandaiAktif(false);
    }

    function posisi() {
      list.classList.remove("naik");
      const r = btn.getBoundingClientRect();
      const tinggi = list.offsetHeight;
      const bawah = window.innerHeight - r.bottom;
      list.classList.toggle("naik", bawah < tinggi + 12 && r.top > bawah);
    }

    function buka() {
      if (select.disabled) return;
      if (terbuka && terbuka !== inst) terbuka.tutup();
      render();
      aktif = Math.max(0, select.selectedIndex);
      list.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
      terbuka = inst;
      posisi();
      tandaiAktif(false);
      // Saat dibuka, taruh pilihan aktif di tengah daftar supaya tidak ada baris yang terpotong di tepi.
      const li = list.children[aktif];
      if (li) list.scrollTop = Math.max(0, li.offsetTop - (list.clientHeight - li.offsetHeight) / 2);
    }

    function tutup(fokus) {
      list.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
      btn.removeAttribute("aria-activedescendant");
      if (terbuka === inst) terbuka = null;
      if (fokus) btn.focus();
    }

    function pilih(i) {
      if (i < 0 || i >= select.options.length) return;
      const lama = select.value;
      nilaiAsli.set.call(select, select.options[i].value);
      render();
      if (select.value !== lama) select.dispatchEvent(new Event("change", { bubbles: true }));
      tutup(true);
    }

    const inst = { tutup, contains: (el) => shell.contains(el) };

    btn.addEventListener("click", () => (list.classList.contains("hidden") ? buka() : tutup()));

    btn.addEventListener("keydown", (e) => {
      const tertutup = list.classList.contains("hidden");
      const n = select.options.length;
      if (tertutup) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          buka();
        }
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); aktif = Math.min(n - 1, aktif + 1); tandaiAktif(true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); aktif = Math.max(0, aktif - 1); tandaiAktif(true); }
      else if (e.key === "Home") { e.preventDefault(); aktif = 0; tandaiAktif(true); }
      else if (e.key === "End") { e.preventDefault(); aktif = n - 1; tandaiAktif(true); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pilih(aktif); }
      else if (e.key === "Escape") { e.preventDefault(); tutup(true); }
      else if (e.key === "Tab") { tutup(); }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Ketik huruf awal untuk melompat ke pilihan yang cocok.
        ketikan += e.key.toLowerCase();
        clearTimeout(ketikanTimer);
        ketikanTimer = setTimeout(() => (ketikan = ""), 700);
        const opts = [...select.options];
        const cocok = opts.findIndex((o, i) => i >= aktif && o.textContent.toLowerCase().startsWith(ketikan));
        const dari0 = cocok >= 0 ? cocok : opts.findIndex((o) => o.textContent.toLowerCase().startsWith(ketikan));
        if (dari0 >= 0) { aktif = dari0; tandaiAktif(true); }
      }
    });

    // mousedown dicegah supaya fokus tetap di tombol saat memilih dengan mouse.
    list.addEventListener("mousedown", (e) => e.preventDefault());
    list.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li) pilih(Number(li.dataset.i));
    });
    list.addEventListener("mousemove", (e) => {
      const li = e.target.closest("li");
      if (li && Number(li.dataset.i) !== aktif) { aktif = Number(li.dataset.i); tandaiAktif(false); }
    });

    // Kode lain yang mengisi select.value atau select.disabled langsung ikut tercermin di tampilan.
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return nilaiAsli.get.call(this); },
      set(v) { nilaiAsli.set.call(this, v); render(); }
    });
    Object.defineProperty(select, "disabled", {
      configurable: true,
      get() { return disabledAsli.get.call(this); },
      set(v) { disabledAsli.set.call(this, v); render(); }
    });
    // Mengganti isi option (select.innerHTML = ...) juga disusul render ulang.
    new MutationObserver(render).observe(select, { childList: true });
    // Fokus ke select asli (mis. dari skrip lain) dialihkan ke tombol.
    select.addEventListener("focus", () => btn.focus());

    render();
  }

  document.querySelectorAll(".field-shell select").forEach(bangun);

  document.addEventListener("mousedown", (e) => {
    if (terbuka && !terbuka.contains(e.target)) terbuka.tutup();
  });
  window.addEventListener("blur", () => terbuka && terbuka.tutup());
})();
