document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('excel-upload');
    const fileNameDisplay = document.getElementById('file-name');
    const downloadBtn = document.getElementById('download-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');
    const previewGrid = document.getElementById('preview-grid');
    const backgroundColorInput = document.getElementById('background-color');
    const textColorInput = document.getElementById('text-color');

    let zip = new JSZip();
    let entriesToProcess = [];
    let generationId = 0;

    const regenerateStickers = async () => {
        if (entriesToProcess.length === 0) return;

        try {
            await processData(entriesToProcess);
        } catch (error) {
            console.error('Error membuat stiker:', error);
            alert(`Gagal membuat stiker: ${error.message || error}`);
        }
    };

    backgroundColorInput.addEventListener('change', regenerateStickers);
    textColorInput.addEventListener('change', regenerateStickers);

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        generationId++;
        entriesToProcess = [];
        fileNameDisplay.textContent = file.name;
        downloadBtn.disabled = true;
        previewGrid.innerHTML = '';
        progressContainer.classList.add('hidden');
        zip = new JSZip();

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                if (!firstSheetName) {
                    throw new Error('File Excel tidak memiliki sheet.');
                }
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, {
                    header: 1,
                    defval: ""
                });
                const nameColumns = (rows[0] || []).reduce((columns, header, index) => {
                    if (String(header).trim().toLowerCase() === 'nama') {
                        columns.push(index);
                    }
                    return columns;
                }, []);

                if (nameColumns.length === 0) {
                    alert('Tidak ditemukan kolom "Nama" pada baris pertama sheet Excel.');
                    return;
                }

                const nameEntries = nameColumns.flatMap(columnIndex =>
                    rows.slice(1)
                        .map(row => ({
                            name: String(row[columnIndex] || '').trim(),
                            number: String(row[columnIndex - 1] ?? '').trim()
                        }))
                        .filter(entry =>
                            entry.name !== '' && entry.name.toLowerCase() !== 'nama'
                        )
                );

                if (nameEntries.length === 0) {
                    alert('Tidak ada nama yang dapat diproses pada file Excel.');
                    return;
                }

                const hasValidNumbers = nameEntries.every(entry =>
                    entry.number !== '' && Number.isFinite(Number(entry.number))
                );
                if (!hasValidNumbers) {
                    alert('Pastikan setiap nama memiliki nomor yang valid pada kolom "No".');
                    return;
                }

                nameEntries.sort((a, b) => Number(a.number) - Number(b.number));
                entriesToProcess = nameEntries;
                await processData(nameEntries);

            } catch (error) {
                console.error("Error membaca Excel:", error);
                alert(`Gagal membaca atau membuat stiker: ${error.message || error}`);
            }
        };
        reader.onerror = () => {
            alert('Gagal membaca file Excel.');
        };
        reader.readAsArrayBuffer(file);
    });

    async function processData(entries) {
        const currentGenerationId = ++generationId;
        const backgroundColor = backgroundColorInput.value;
        const textColor = textColorInput.value;

        zip = new JSZip();
        previewGrid.innerHTML = '';
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = `Memproses: 0 / ${entries.length}`;
        progressPercentage.textContent = '0%';
        downloadBtn.disabled = true;
        const total = entries.length;
        
        for (let i = 0; i < total; i++) {
            if (currentGenerationId !== generationId) return;

            const { name, number } = entries[i];
            const mainCanvas = document.createElement('canvas');
            mainCanvas.width = 1063;
            mainCanvas.height = 236;
            const ctx = mainCanvas.getContext('2d');

            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const fontFamily = '"Arial", "Microsoft YaHei", sans-serif';
            const label = `${number}. ${name}`;
            const maxFontSize = 76;
            const maxTextWidth = mainCanvas.width - 100;
            ctx.font = `700 ${maxFontSize}px ${fontFamily}`;
            const measuredWidth = ctx.measureText(label).width;
            const fontSize = measuredWidth > maxTextWidth
                ? maxFontSize * maxTextWidth / measuredWidth
                : maxFontSize;
            ctx.font = `700 ${fontSize}px ${fontFamily}`;
            ctx.fillText(label, mainCanvas.width / 2, mainCanvas.height / 2);

            const canvasBlob = await new Promise(resolve => mainCanvas.toBlob(resolve, 'image/png'));
            if (!canvasBlob) {
                throw new Error(`Gagal membuat gambar untuk nama "${name}".`);
            }
            const stickerBlob = await setPngResolution(canvasBlob, 300);
            if (currentGenerationId !== generationId) return;

            zip.file(`Stiker_${String(i + 1).padStart(3, '0')}.png`, stickerBlob);

            const previewImg = document.createElement('img');
            previewImg.className = 'preview-card';
            previewImg.alt = `Nomor ${number}: ${name}`;
            previewImg.src = mainCanvas.toDataURL('image/png');
            previewGrid.appendChild(previewImg);

            const current = i + 1;
            const percent = Math.round((current / total) * 100);
            progressText.textContent = `Memproses: ${current} / ${total}`;
            progressBar.style.width = `${percent}%`;
            progressPercentage.textContent = `${percent}%`;

            await new Promise(r => setTimeout(r, 10));
        }

        progressText.textContent = 'Selesai!';
        downloadBtn.disabled = false;
    }

    async function setPngResolution(blob, dpi) {
        const png = new Uint8Array(await blob.arrayBuffer());
        const signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (!signature.every((byte, index) => png[index] === byte)) {
            throw new Error('Format gambar PNG tidak valid.');
        }

        const pixelsPerMeter = Math.round(dpi / 0.0254);
        const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
        let offset = signature.length;
        while (offset + 12 <= png.length) {
            const chunkLength = view.getUint32(offset, false);
            const chunkEnd = offset + 12 + chunkLength;
            if (chunkEnd > png.length) {
                throw new Error('Data gambar PNG tidak lengkap.');
            }

            const chunkType = String.fromCharCode(
                png[offset + 4],
                png[offset + 5],
                png[offset + 6],
                png[offset + 7]
            );
            if (chunkType === 'pHYs') {
                if (chunkLength !== 9) {
                    throw new Error('Metadata resolusi PNG tidak valid.');
                }
                view.setUint32(offset + 8, pixelsPerMeter, false);
                view.setUint32(offset + 12, pixelsPerMeter, false);
                png[offset + 16] = 1;
                view.setUint32(
                    offset + 17,
                    crc32(png.subarray(offset + 4, offset + 17)),
                    false
                );
                return new Blob([png], { type: blob.type });
            }

            if (chunkType === 'IEND') {
                const chunk = new Uint8Array(21);
                const chunkView = new DataView(chunk.buffer);
                chunkView.setUint32(0, 9, false);
                chunk.set([112, 72, 89, 115], 4);
                chunkView.setUint32(8, pixelsPerMeter, false);
                chunkView.setUint32(12, pixelsPerMeter, false);
                chunk[16] = 1;
                chunkView.setUint32(17, crc32(chunk.subarray(4, 17)), false);
                return new Blob(
                    [png.subarray(0, offset), chunk, png.subarray(offset)],
                    { type: blob.type }
                );
            }

            offset = chunkEnd;
        }

        throw new Error('Gambar PNG tidak memiliki penanda akhir yang valid.');
    }

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) {
                crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
            }
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    // Fungsi Download ZIP
    downloadBtn.addEventListener('click', async () => {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Memproses ZIP...';

        try {
            const content = await zip.generateAsync({ type: 'blob' });
            
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Export_Stiker_Nama_dan_Nomor.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            downloadBtn.textContent = '💾 Download Semua (ZIP)';
            downloadBtn.disabled = false;
        } catch (err) {
            console.error("Error creating ZIP:", err);
            alert("Gagal mengkompresi file.");
            downloadBtn.textContent = '💾 Download Semua (ZIP)';
            downloadBtn.disabled = false;
        }
    });
});