(function () {
  "use strict";

  const DATA_CODEWORDS_L = [
    0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274,
    324, 370, 428, 461, 523, 589, 647, 721, 795, 861,
    932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631,
    1735, 1843, 1955, 2071, 2191, 2306, 2434, 2566, 2702,
    2812, 2956
  ];

  const ECC_CODEWORDS_PER_BLOCK_L = [
    0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
    20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
    28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30
  ];

  const NUM_ERROR_CORRECTION_BLOCKS_L = [
    0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
    4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
    8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
    16, 17, 18, 19, 19, 20, 21, 22, 24, 25
  ];

  function appendBits(buffer, value, length) {
    for (let i = length - 1; i >= 0; i--) {
      buffer.push((value >>> i) & 1);
    }
  }

  function bitBufferToBytes(bits) {
    const result = [];
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j++) value = (value << 1) | (bits[i + j] || 0);
      result.push(value);
    }
    return result;
  }

  function getNumRawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const numAlign = Math.floor(version / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function reedSolomonMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = ((z << 1) ^ ((z >>> 7) * 0x11D)) & 0xFF;
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function reedSolomonComputeDivisor(degree) {
    const result = Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  function reedSolomonComputeRemainder(data, divisor) {
    const result = Array(divisor.length).fill(0);
    data.forEach(byte => {
      const factor = byte ^ result.shift();
      result.push(0);
      divisor.forEach((coef, index) => {
        result[index] ^= reedSolomonMultiply(coef, factor);
      });
    });
    return result;
  }

  function addEccAndInterleave(data, version) {
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_L[version];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK_L[version];
    const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const divisor = reedSolomonComputeDivisor(blockEccLen);
    const blocks = [];
    let offset = 0;

    for (let i = 0; i < numBlocks; i++) {
      const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(offset, offset + dataLen);
      offset += dataLen;
      const ecc = reedSolomonComputeRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(blocks[j][i]);
        }
      }
    }
    return result;
  }

  function getAlignmentPatternPositions(version) {
    if (version === 1) return [];
    const size = version * 4 + 17;
    const numAlign = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  function createMatrix(size) {
    return {
      modules: Array.from({ length: size }, () => Array(size).fill(false)),
      functionModules: Array.from({ length: size }, () => Array(size).fill(false))
    };
  }

  function setFunctionModule(matrix, x, y, isDark) {
    const size = matrix.modules.length;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    matrix.modules[y][x] = Boolean(isDark);
    matrix.functionModules[y][x] = true;
  }

  function drawFinderPattern(matrix, x, y) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        const isDark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
          && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setFunctionModule(matrix, xx, yy, isDark);
      }
    }
  }

  function drawAlignmentPattern(matrix, cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setFunctionModule(matrix, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) === 2 || (dx === 0 && dy === 0));
      }
    }
  }

  function getBit(value, index) {
    return ((value >>> index) & 1) !== 0;
  }

  function drawFormatBits(matrix, mask) {
    const size = matrix.modules.length;
    const data = (1 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
    }
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) setFunctionModule(matrix, 8, i, getBit(bits, i));
    setFunctionModule(matrix, 8, 7, getBit(bits, 6));
    setFunctionModule(matrix, 8, 8, getBit(bits, 7));
    setFunctionModule(matrix, 7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFunctionModule(matrix, 14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) setFunctionModule(matrix, size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFunctionModule(matrix, 8, size - 15 + i, getBit(bits, i));
    setFunctionModule(matrix, 8, size - 8, true);
  }

  function drawVersion(matrix, version) {
    if (version < 7) return;
    const size = matrix.modules.length;
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ (((rem >>> 11) & 1) * 0x1F25);
    }
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + i % 3;
      const b = Math.floor(i / 3);
      setFunctionModule(matrix, a, b, bit);
      setFunctionModule(matrix, b, a, bit);
    }
  }

  function drawFunctionPatterns(matrix, version) {
    const size = matrix.modules.length;
    drawFinderPattern(matrix, 0, 0);
    drawFinderPattern(matrix, size - 7, 0);
    drawFinderPattern(matrix, 0, size - 7);

    getAlignmentPatternPositions(version).forEach(x => {
      getAlignmentPatternPositions(version).forEach(y => {
        const overlapsFinder = (x === 6 && y === 6) || (x === 6 && y === size - 7) || (x === size - 7 && y === 6);
        if (!overlapsFinder) drawAlignmentPattern(matrix, x, y);
      });
    });

    for (let i = 0; i < size; i++) {
      if (!matrix.functionModules[6][i]) setFunctionModule(matrix, i, 6, i % 2 === 0);
      if (!matrix.functionModules[i][6]) setFunctionModule(matrix, 6, i, i % 2 === 0);
    }

    drawFormatBits(matrix, 0);
    drawVersion(matrix, version);
  }

  function drawCodewords(matrix, codewords) {
    const size = matrix.modules.length;
    const bits = [];
    codewords.forEach(byte => appendBits(bits, byte, 8));

    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right--;
      for (let vert = 0; vert < size; vert++) {
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          if (!matrix.functionModules[y][x]) {
            matrix.modules[y][x] = bitIndex < bits.length && bits[bitIndex] === 1;
            bitIndex++;
          }
        }
      }
    }
  }

  function maskCondition(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      default: return false;
    }
  }

  function applyMask(matrix, mask) {
    const size = matrix.modules.length;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!matrix.functionModules[y][x] && maskCondition(mask, x, y)) {
          matrix.modules[y][x] = !matrix.modules[y][x];
        }
      }
    }
  }

  function cloneMatrix(matrix) {
    return {
      modules: matrix.modules.map(row => row.slice()),
      functionModules: matrix.functionModules.map(row => row.slice())
    };
  }

  function getPenaltyScore(matrix) {
    const modules = matrix.modules;
    const size = modules.length;
    let result = 0;

    for (let y = 0; y < size; y++) {
      let runColor = modules[y][0];
      let runLength = 1;
      for (let x = 1; x < size; x++) {
        if (modules[y][x] === runColor) {
          runLength++;
          if (runLength === 5) result += 3;
          else if (runLength > 5) result++;
        } else {
          runColor = modules[y][x];
          runLength = 1;
        }
      }
    }

    for (let x = 0; x < size; x++) {
      let runColor = modules[0][x];
      let runLength = 1;
      for (let y = 1; y < size; y++) {
        if (modules[y][x] === runColor) {
          runLength++;
          if (runLength === 5) result += 3;
          else if (runLength > 5) result++;
        } else {
          runColor = modules[y][x];
          runLength = 1;
        }
      }
    }

    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
          result += 3;
        }
      }
    }

    const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x <= size - 11; x++) {
        const slice = modules[y].slice(x, x + 11);
        if (matchesPattern(slice, pattern1) || matchesPattern(slice, pattern2)) result += 40;
      }
    }
    for (let x = 0; x < size; x++) {
      for (let y = 0; y <= size - 11; y++) {
        const slice = [];
        for (let k = 0; k < 11; k++) slice.push(modules[y + k][x]);
        if (matchesPattern(slice, pattern1) || matchesPattern(slice, pattern2)) result += 40;
      }
    }

    let dark = 0;
    modules.forEach(row => row.forEach(value => { if (value) dark++; }));
    const total = size * size;
    result += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;

    return result;
  }

  function matchesPattern(values, pattern) {
    return values.every((value, index) => value === pattern[index]);
  }

  function encodeText(text) {
    const data = Array.from(new TextEncoder().encode(text));
    let version = 1;
    let bits = null;

    for (; version <= 40; version++) {
      const ccBits = version <= 9 ? 8 : 16;
      if (data.length >= (1 << ccBits)) continue;

      const candidate = [];
      appendBits(candidate, 0x4, 4);
      appendBits(candidate, data.length, ccBits);
      data.forEach(byte => appendBits(candidate, byte, 8));

      if (candidate.length <= DATA_CODEWORDS_L[version] * 8) {
        bits = candidate;
        break;
      }
    }

    if (!bits) throw new Error("QR data is too long");

    const dataCapacityBits = DATA_CODEWORDS_L[version] * 8;
    appendBits(bits, 0, Math.min(4, dataCapacityBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const dataCodewords = bitBufferToBytes(bits);
    for (let pad = 0xEC; dataCodewords.length < DATA_CODEWORDS_L[version]; pad ^= 0xEC ^ 0x11) {
      dataCodewords.push(pad);
    }

    const allCodewords = addEccAndInterleave(dataCodewords, version);
    const size = version * 4 + 17;
    const matrix = createMatrix(size);
    drawFunctionPatterns(matrix, version);
    drawCodewords(matrix, allCodewords);

    let bestMask = 0;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = cloneMatrix(matrix);
      applyMask(candidate, mask);
      drawFormatBits(candidate, mask);
      const penalty = getPenaltyScore(candidate);
      if (penalty < bestPenalty) {
        bestMask = mask;
        bestPenalty = penalty;
      }
    }

    applyMask(matrix, bestMask);
    drawFormatBits(matrix, bestMask);

    return matrix.modules;
  }

  function drawQrToCanvas(canvas, text, options = {}) {
    const modules = encodeText(text);
    const margin = options.margin ?? 3;
    const requestedWidth = options.width || canvas.width || 280;
    const size = modules.length + margin * 2;
    const scale = requestedWidth / size;
    canvas.width = requestedWidth;
    canvas.height = requestedWidth;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";

    modules.forEach((row, y) => {
      row.forEach((isDark, x) => {
        if (!isDark) return;
        ctx.fillRect((x + margin) * scale, (y + margin) * scale, Math.ceil(scale), Math.ceil(scale));
      });
    });
  }

  window.BMGLocalQRCode = {
    toCanvas(canvas, text, options, callback) {
      try {
        drawQrToCanvas(canvas, text, options || {});
        if (callback) callback(null);
      } catch (error) {
        if (callback) callback(error);
        else throw error;
      }
    }
  };
})();
