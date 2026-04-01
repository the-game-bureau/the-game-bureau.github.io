const window = { location: { href: 'https://the-game-bureau.github.io/the-game-bureau/game.html?id=12345678-1234-1234-1234-123456789012', origin: 'https://the-game-bureau.github.io' } };
const document = { body: { innerHTML: '', appendChild() {} }, createElement() { return { style: {}, textContent: '' }; }, getElementById() { return { style: {}, appendChild() {}, textContent: '', src: '', href: '', innerHTML: '' }; }, addEventListener() {} };
const URL = globalThis.URL;
const URLSearchParams = globalThis.URLSearchParams;
const TextEncoder = globalThis.TextEncoder;
const SB_CONFIG = {
      url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
      key: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3',
      table: 'games'
    };

    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('id');
    const FALLBACK_GUIDE_AVATAR =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23111827'/%3E%3Ccircle cx='48' cy='36' r='18' fill='%23ffffff'/%3E%3Cpath d='M20 82c4-15 16-24 28-24s24 9 28 24' fill='%23ffffff'/%3E%3C/svg%3E";

    function renderFatalState(message) {
      document.body.innerHTML = '';

      const heading = document.createElement('h2');
      heading.style.color = 'white';
      heading.style.textAlign = 'center';
      heading.style.marginTop = '50px';
      heading.textContent = message;
      document.body.appendChild(heading);
    }

    function getDatabaseOrigin() {
      return new URL(SB_CONFIG.url).origin;
    }

    function sanitizeAssetUrl(value) {
      if (typeof value !== 'string' || !value.trim()) {
        return '';
      }

      const rawValue = value.trim();

      if (rawValue.startsWith('data:') || rawValue.startsWith('blob:')) {
        return rawValue;
      }

      try {
        const resolvedUrl = new URL(rawValue, window.location.href);
        const isSameOrigin = resolvedUrl.origin === window.location.origin;
        const isDatabaseOrigin = resolvedUrl.origin === getDatabaseOrigin();

        return isSameOrigin || isDatabaseOrigin ? resolvedUrl.toString() : '';
      } catch (error) {
        return '';
      }
    }

    async function fetchGameRecord(id) {
      const requestUrl = new URL(`rest/v1/${SB_CONFIG.table}`, `${SB_CONFIG.url.replace(/\/+$/, '')}/`);
      requestUrl.searchParams.set('select', '*');
      requestUrl.searchParams.set('id', `eq.${id}`);
      requestUrl.searchParams.set('limit', '1');

      const response = await fetch(requestUrl.toString(), {
        headers: {
          apikey: SB_CONFIG.key,
          Authorization: `Bearer ${SB_CONFIG.key}`,
          Accept: 'application/json'
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;

        try {
          const payload = await response.json();
          message = payload.message || payload.error_description || payload.error || message;
        } catch (parseError) {
          // Fall back to the status-based message when no JSON body is available.
        }

        throw new Error(message);
      }

      const rows = await response.json();
      return Array.isArray(rows) ? rows[0] || null : null;
    }

    function multiplyGf256(x, y) {
      let result = 0;
      let a = x;
      let b = y;

      while (b > 0) {
        if (b & 1) {
          result ^= a;
        }

        a <<= 1;
        if (a & 0x100) {
          a ^= 0x11d;
        }
        b >>= 1;
      }

      return result;
    }

    function buildReedSolomonGenerator(degree) {
      let polynomial = [1];

      for (let i = 0; i < degree; i += 1) {
        const next = new Array(polynomial.length + 1).fill(0);

        for (let j = 0; j < polynomial.length; j += 1) {
          next[j] ^= multiplyGf256(polynomial[j], 1);
          next[j + 1] ^= multiplyGf256(polynomial[j], 1 << 0);
        }

        for (let j = 0; j < next.length; j += 1) {
          next[j] = next[j];
        }

        let factor = 1;
        for (let k = 0; k < i; k += 1) {
          factor = multiplyGf256(factor, 2);
        }

        const product = new Array(polynomial.length + 1).fill(0);
        for (let j = 0; j < polynomial.length; j += 1) {
          product[j] ^= polynomial[j];
          product[j + 1] ^= multiplyGf256(polynomial[j], factor);
        }
        polynomial = product;
      }

      return polynomial;
    }

    function computeErrorCorrection(dataCodewords, ecCodewords) {
      const generator = buildReedSolomonGenerator(ecCodewords);
      const remainder = new Array(ecCodewords).fill(0);

      for (const value of dataCodewords) {
        const factor = value ^ remainder[0];
        remainder.shift();
        remainder.push(0);

        for (let i = 0; i < ecCodewords; i += 1) {
          remainder[i] ^= multiplyGf256(generator[i + 1], factor);
        }
      }

      return remainder;
    }

    function appendBits(buffer, value, length) {
      for (let i = length - 1; i >= 0; i -= 1) {
        buffer.push((value >>> i) & 1);
      }
    }

    function createQrCodeBytes(text) {
      const version = 5;
      const dataCapacity = 108;
      const ecCodewords = 26;
      const maxPayloadLength = dataCapacity - 2;
      const encodedText = new TextEncoder().encode(text);

      if (encodedText.length > maxPayloadLength) {
        throw new Error('Invite link is too long to encode as a standalone QR code.');
      }

      const bits = [];
      appendBits(bits, 0b0100, 4);
      appendBits(bits, encodedText.length, 8);

      for (const byte of encodedText) {
        appendBits(bits, byte, 8);
      }

      const capacityBits = dataCapacity * 8;
      appendBits(bits, 0, Math.min(4, capacityBits - bits.length));

      while (bits.length % 8 !== 0) {
        bits.push(0);
      }

      const dataCodewords = [];
      for (let i = 0; i < bits.length; i += 8) {
        let value = 0;
        for (let j = 0; j < 8; j += 1) {
          value = (value << 1) | bits[i + j];
        }
        dataCodewords.push(value);
      }

      const padBytes = [0xec, 0x11];
      let padIndex = 0;
      while (dataCodewords.length < dataCapacity) {
        dataCodewords.push(padBytes[padIndex % padBytes.length]);
        padIndex += 1;
      }

      return dataCodewords.concat(computeErrorCorrection(dataCodewords, ecCodewords));
    }

    function createQrMatrix(text) {
      const version = 5;
      const size = 17 + version * 4;
      const matrix = Array.from({ length: size }, () => Array(size).fill(false));
      const isFunction = Array.from({ length: size }, () => Array(size).fill(false));
      const alignmentPositions = [6, 30];

      function setModule(x, y, value, markFunction = true) {
        matrix[y][x] = value;
        if (markFunction) {
          isFunction[y][x] = true;
        }
      }

      function drawFinder(x, y) {
        for (let dy = -1; dy <= 7; dy += 1) {
          for (let dx = -1; dx <= 7; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) {
              continue;
            }

            const isBorder = dx === -1 || dx === 7 || dy === -1 || dy === 7;
            const isOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
            const isInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
            setModule(xx, yy, !isBorder && (isOuter || isInner));
          }
        }
      }

      function drawAlignment(x, y) {
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            setModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }

      function drawFormatBits(mask) {
        const formatData = (0b01 << 3) | mask;
        let formatBits = formatData << 10;
        const generator = 0x537;

        for (let i = 14; i >= 10; i -= 1) {
          if ((formatBits >>> i) & 1) {
            formatBits ^= generator << (i - 10);
          }
        }

        const finalBits = ((formatData << 10) | formatBits) ^ 0x5412;
        const bit = (index) => ((finalBits >>> index) & 1) === 1;

        for (let i = 0; i <= 5; i += 1) setModule(8, i, bit(i));
        setModule(8, 7, bit(6));
        setModule(8, 8, bit(7));
        setModule(7, 8, bit(8));
        for (let i = 9; i < 15; i += 1) setModule(14 - i, 8, bit(i));

        for (let i = 0; i < 8; i += 1) setModule(size - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i += 1) setModule(8, size - 15 + i, bit(i));
        setModule(8, size - 8, true);
      }

      function maskApplies(mask, x, y) {
        switch (mask) {
          case 0: return (x + y) % 2 === 0;
          case 1: return y % 2 === 0;
          case 2: return x % 3 === 0;
          case 3: return (x + y) % 3 === 0;
          case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
          case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
          case 6: return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
          case 7: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
          default: return false;
        }
      }

      function penaltyScore(candidate) {
        let penalty = 0;

        for (let y = 0; y < size; y += 1) {
          let runColor = candidate[y][0];
          let runLength = 1;
          for (let x = 1; x < size; x += 1) {
            if (candidate[y][x] === runColor) {
              runLength += 1;
            } else {
              if (runLength >= 5) {
                penalty += runLength - 2;
              }
              runColor = candidate[y][x];
              runLength = 1;
            }
          }
          if (runLength >= 5) {
            penalty += runLength - 2;
          }
        }

        for (let x = 0; x < size; x += 1) {
          let runColor = candidate[0][x];
          let runLength = 1;
          for (let y = 1; y < size; y += 1) {
            if (candidate[y][x] === runColor) {
              runLength += 1;
            } else {
              if (runLength >= 5) {
                penalty += runLength - 2;
              }
              runColor = candidate[y][x];
              runLength = 1;
            }
          }
          if (runLength >= 5) {
            penalty += runLength - 2;
          }
        }

        for (let y = 0; y < size - 1; y += 1) {
          for (let x = 0; x < size - 1; x += 1) {
            const color = candidate[y][x];
            if (
              candidate[y][x + 1] === color &&
              candidate[y + 1][x] === color &&
              candidate[y + 1][x + 1] === color
            ) {
              penalty += 3;
            }
          }
        }

        const finderLike = [true, false, true, true, true, false, true, false, false, false, false];
        const reverseFinderLike = [...finderLike].reverse();

        function matchesPattern(line, index, pattern) {
          for (let i = 0; i < pattern.length; i += 1) {
            if (line[index + i] !== pattern[i]) {
              return false;
            }
          }
          return true;
        }

        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x <= size - 11; x += 1) {
            if (matchesPattern(candidate[y], x, finderLike) || matchesPattern(candidate[y], x, reverseFinderLike)) {
              penalty += 40;
            }
          }
        }

        for (let x = 0; x < size; x += 1) {
          const column = [];
          for (let y = 0; y < size; y += 1) {
            column.push(candidate[y][x]);
          }
          for (let y = 0; y <= size - 11; y += 1) {
            if (matchesPattern(column, y, finderLike) || matchesPattern(column, y, reverseFinderLike)) {
              penalty += 40;
            }
          }
        }

        let darkModules = 0;
        for (const row of candidate) {
          for (const cell of row) {
            if (cell) {
              darkModules += 1;
            }
          }
        }

        const totalModules = size * size;
        const darkPercent = (darkModules * 100) / totalModules;
        penalty += Math.floor(Math.abs(darkPercent - 50) / 5) * 10;

        return penalty;
      }

      drawFinder(0, 0);
      drawFinder(size - 7, 0);
      drawFinder(0, size - 7);

      for (let i = 8; i < size - 8; i += 1) {
        setModule(i, 6, i % 2 === 0);
        setModule(6, i, i % 2 === 0);
      }

      for (const x of alignmentPositions) {
        for (const y of alignmentPositions) {
          const overlapsFinder =
            (x === 6 && y === 6) ||
            (x === 6 && y === size - 7) ||
            (x === size - 7 && y === 6);

          if (!overlapsFinder) {
            drawAlignment(x, y);
          }
        }
      }

      for (let i = 0; i < 8; i += 1) {
        if (i !== 6) {
          setModule(8, i, false);
          setModule(i, 8, false);
        }
      }
      for (let i = size - 8; i < size; i += 1) {
        setModule(8, i, false);
        setModule(i, 8, false);
      }
      setModule(8, size - 8, true);

      const codewords = createQrCodeBytes(text);
      const dataBits = [];
      for (const codeword of codewords) {
        appendBits(dataBits, codeword, 8);
      }

      let bitIndex = 0;
      let direction = -1;
      for (let x = size - 1; x >= 1; x -= 2) {
        if (x === 6) {
          x -= 1;
        }

        for (let step = 0; step < size; step += 1) {
          const y = direction === -1 ? size - 1 - step : step;
          for (let offset = 0; offset < 2; offset += 1) {
            const xx = x - offset;
            if (isFunction[y][xx]) {
              continue;
            }

            matrix[y][xx] = bitIndex < dataBits.length ? dataBits[bitIndex] === 1 : false;
            bitIndex += 1;
          }
        }

        direction *= -1;
      }

      let bestMask = 0;
      let bestMatrix = null;
      let bestPenalty = Number.POSITIVE_INFINITY;

      for (let mask = 0; mask < 8; mask += 1) {
        const candidate = matrix.map((row) => row.slice());

        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            if (!isFunction[y][x] && maskApplies(mask, x, y)) {
              candidate[y][x] = !candidate[y][x];
            }
          }
        }

        const previousMatrix = matrix.map((row) => row.slice());
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            matrix[y][x] = candidate[y][x];
          }
        }
        drawFormatBits(mask);
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            candidate[y][x] = matrix[y][x];
            matrix[y][x] = previousMatrix[y][x];
          }
        }

        const score = penaltyScore(candidate);
        if (score < bestPenalty) {
          bestPenalty = score;
          bestMask = mask;
          bestMatrix = candidate;
        }
      }

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          matrix[y][x] = bestMatrix[y][x];
        }
      }
      drawFormatBits(bestMask);

      return matrix;
    }

    function renderQrCode(container, text, size = 180) {
      const matrix = createQrMatrix(text);
      const moduleCount = matrix.length;
      const quietZone = 4;
      const totalModules = moduleCount + quietZone * 2;
      const moduleSize = size / totalModules;

      const svgParts = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${size}" height="${size}" shape-rendering="crispEdges">`,
        `<rect width="${totalModules}" height="${totalModules}" fill="#ffffff"/>`
      ];

      for (let y = 0; y < moduleCount; y += 1) {
        for (let x = 0; x < moduleCount; x += 1) {
          if (matrix[y][x]) {
            svgParts.push(
              `<rect x="${x + quietZone}" y="${y + quietZone}" width="1" height="1" fill="#000000"/>`
            );
          }
        }
      }

      svgParts.push('</svg>');
      container.innerHTML = svgParts.join('');
      const svg = container.querySelector('svg');
      if (svg) {
        svg.style.display = 'block';
        svg.style.width = `${size}px`;
        svg.style.height = `${size}px`;
      }
    }

    async function init() {
      if (!gameId) {
        renderFatalState('No Game ID Found');
        return;
      }

      try {
        const game = await fetchGameRecord(gameId);
        if (!game) {
          renderFatalState('Error Loading Game');
          return;
        }

        const primaryColor = game.primary_color || game.primaryColor || '#33e6e6';
        const secondaryColor = game.secondary_color || game.secondaryColor || '#243256';
        document.documentElement.style.setProperty('--primary', primaryColor);
        document.documentElement.style.setProperty('--secondary', secondaryColor);

        const gameNode = game.nodes?.find((node) => node.type === 'game') || {};

        document.getElementById('gameTitle').textContent = game.name || 'Untitled Game';
        document.getElementById('gameTagline').textContent = gameNode.tagline || '';

        const safeLogoUrl = sanitizeAssetUrl(gameNode.logoUrl);
        if (safeLogoUrl) {
          const logo = document.getElementById('landingLogo');
          logo.src = safeLogoUrl;
          logo.style.display = 'inline-block';
        }

        if (gameNode.guideName) {
          document.getElementById('guideSection').style.display = 'flex';
          document.getElementById('guideNameDisplay').textContent = gameNode.guideName.toUpperCase();
          document.getElementById('guideDescription').textContent = gameNode.guideBio || 'Your mission lead.';
          const gImg = sanitizeAssetUrl(gameNode.guideImage || gameNode.guideImageUrl) || FALLBACK_GUIDE_AVATAR;
          document.getElementById('guideAvatar').src = gImg;
        }

        document.getElementById('desc').textContent = gameNode.body || '';
        document.getElementById('gamePrice').textContent = (gameNode.price || 'FREE').toUpperCase();

        const tagsContainer = document.getElementById('tagsContainer');
        if (Array.isArray(gameNode.tags)) {
          gameNode.tags.forEach((tagValue) => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.textContent = tagValue;
            tagsContainer.appendChild(span);
          });
        }

        const gameUrl = new URL(`game.html?id=${encodeURIComponent(gameId)}`, window.location.href).toString();
        renderQrCode(document.getElementById('qrcode'), gameUrl, 180);

        document.getElementById('smsBtn').href = `sms:?body=Join me for this experience: ${encodeURIComponent(gameUrl)}`;
        document.getElementById('startBtn').href = `play.html?id=${encodeURIComponent(gameId)}`;
        document.getElementById('landing').style.display = 'block';
      } catch (error) {
        console.error('Game fetch error:', error);
        renderFatalState('Error Loading Game');
      }
    }

    document.addEventListener('DOMContentLoaded', init);
const matrix = createQrMatrix('https://the-game-bureau.github.io/the-game-bureau/game.html?id=12345678-1234-1234-1234-123456789012');
if (!Array.isArray(matrix) || matrix.length !== 37 || !Array.isArray(matrix[0]) || matrix[0].length !== 37) { throw new Error('Unexpected QR matrix shape'); }
console.log('QR matrix OK', matrix.length, matrix[0].length);
