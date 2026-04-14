#ifndef K3_SEARCH_STATE_H
#define K3_SEARCH_STATE_H

#include <stddef.h>
#include <stdint.h>

#include <stdio.h>
#include <string.h>
#include <string>

struct Scalar256 {
    uint64_t limbs[4];
};

struct ThreadScalarState {
    Scalar256 windowStart;
    Scalar256 windowCenter;
};

struct CheckpointHeaderV2 {
    uint32_t magic;
    uint32_t version;
    uint64_t totalScalarChecks;
    uint32_t threadCount;
    uint32_t searchMode;
};

constexpr uint32_t K3_CHECKPOINT_MAGIC = 0x4B335632;   // "K3V2"
constexpr uint32_t K3_CHECKPOINT_VERSION = 2;

inline constexpr Scalar256 SECP_N = {{
    0xBFD25E8CD0364141ULL,
    0xBAAEDCE6AF48A03BULL,
    0xFFFFFFFFFFFFFFFEULL,
    0xFFFFFFFFFFFFFFFFULL,
}};

// Scalar-side GLV endomorphism roots modulo secp256k1 group order n.
// Matches the point-side constants in the codebase as follows:
// - SECP_LAMBDA_BETA  corresponds to point transform using _beta
// - SECP_LAMBDA_BETA2 corresponds to point transform using _beta2
inline constexpr Scalar256 SECP_LAMBDA_BETA = {{
    0xDF02967C1B23BD72ULL,
    0x122E22EA20816678ULL,
    0xA5261C028812645AULL,
    0x5363AD4CC05C30E0ULL,
}};

inline constexpr Scalar256 SECP_LAMBDA_BETA2 = {{
    0xE0CFC810B51283CEULL,
    0xA880B9FC8EC739C2ULL,
    0x5AD9E3FD77ED9BA4ULL,
    0xAC9C52B33FA3CF1FULL,
}};

static inline void scalarSetZero(Scalar256* out) {
    memset(out, 0, sizeof(*out));
}

static inline void scalarSetU64(Scalar256* out, uint64_t value) {
    scalarSetZero(out);
    out->limbs[0] = value;
}

static inline bool scalarIsZero(const Scalar256& a) {
    return (a.limbs[0] | a.limbs[1] | a.limbs[2] | a.limbs[3]) == 0;
}

static inline int scalarCmp(const Scalar256& a, const Scalar256& b) {
    for (int i = 3; i >= 0; i--) {
        if (a.limbs[i] > b.limbs[i]) return 1;
        if (a.limbs[i] < b.limbs[i]) return -1;
    }
    return 0;
}

static inline uint64_t addNoReduce(Scalar256* out, const Scalar256& a, const Scalar256& b) {
    __uint128_t carry = 0;
    for (int i = 0; i < 4; i++) {
        carry += (__uint128_t)a.limbs[i] + b.limbs[i];
        out->limbs[i] = (uint64_t)carry;
        carry >>= 64;
    }
    return (uint64_t)carry;
}

static inline uint64_t subNoReduce(Scalar256* out, const Scalar256& a, const Scalar256& b) {
    uint64_t borrow = 0;
    for (int i = 0; i < 4; i++) {
        __uint128_t lhs = (__uint128_t)a.limbs[i];
        __uint128_t rhs = (__uint128_t)b.limbs[i] + borrow;
        out->limbs[i] = (uint64_t)(lhs - rhs);
        borrow = lhs < rhs ? 1 : 0;
    }
    return borrow;
}

static inline void addScalarModN(Scalar256* out, const Scalar256& a, const Scalar256& b) {
    Scalar256 tmp;
    uint64_t carry = addNoReduce(&tmp, a, b);
    if (carry || scalarCmp(tmp, SECP_N) >= 0) {
        subNoReduce(&tmp, tmp, SECP_N);
    }
    *out = tmp;
}

static inline void subScalarModN(Scalar256* out, const Scalar256& a, const Scalar256& b) {
    Scalar256 tmp;
    uint64_t borrow = subNoReduce(&tmp, a, b);
    if (borrow) {
        addNoReduce(&tmp, tmp, SECP_N);
    }
    *out = tmp;
}

static inline void negateScalarModN(Scalar256* out, const Scalar256& a) {
    if (scalarIsZero(a)) {
        scalarSetZero(out);
        return;
    }
    subNoReduce(out, SECP_N, a);
}

static inline void addU64ToScalarModN(Scalar256* out, const Scalar256& a, uint64_t b) {
    Scalar256 rhs;
    scalarSetU64(&rhs, b);
    addScalarModN(out, a, rhs);
}

static inline void subU64FromScalarModN(Scalar256* out, const Scalar256& a, uint64_t b) {
    Scalar256 rhs;
    scalarSetU64(&rhs, b);
    subScalarModN(out, a, rhs);
}

// Schoolbook 256x256 -> 512 multiplication represented as 8 little-endian limbs.
static inline void mul256Wide(uint64_t out[8], const Scalar256& a, const Scalar256& b) {
    for (int i = 0; i < 8; i++) out[i] = 0;

    for (int i = 0; i < 4; i++) {
        __uint128_t carry = 0;
        for (int j = 0; j < 4; j++) {
            __uint128_t accum =
                (__uint128_t)a.limbs[i] * b.limbs[j] +
                out[i + j] +
                carry;
            out[i + j] = (uint64_t)accum;
            carry = accum >> 64;
        }

        int k = i + 4;
        while (carry && k < 8) {
            __uint128_t accum = (__uint128_t)out[k] + carry;
            out[k] = (uint64_t)accum;
            carry = accum >> 64;
            k++;
        }
    }
}

static inline bool getBit512(const uint64_t limbs[8], int bitIndex) {
    int limb = bitIndex / 64;
    int offset = bitIndex % 64;
    return ((limbs[limb] >> offset) & 1ULL) != 0ULL;
}

// Simple shift-and-subtract reduction modulo n.
static inline void reduceWideModN(Scalar256* out, const uint64_t wide[8]) {
    Scalar256 rem;
    scalarSetZero(&rem);

    for (int bit = 511; bit >= 0; bit--) {
        uint64_t carry = 0;
        for (int i = 0; i < 4; i++) {
            uint64_t nextCarry = rem.limbs[i] >> 63;
            rem.limbs[i] = (rem.limbs[i] << 1) | carry;
            carry = nextCarry;
        }
        rem.limbs[0] |= getBit512(wide, bit) ? 1ULL : 0ULL;
        if (scalarCmp(rem, SECP_N) >= 0) {
            Scalar256 tmp;
            subNoReduce(&tmp, rem, SECP_N);
            rem = tmp;
        }
    }

    *out = rem;
}

static inline void mulScalarModN(Scalar256* out, const Scalar256& a, const Scalar256& b) {
    uint64_t wide[8];
    mul256Wide(wide, a, b);
    reduceWideModN(out, wide);
}

static inline void scalarToArray(const Scalar256& in, uint64_t out[4]) {
    out[0] = in.limbs[0];
    out[1] = in.limbs[1];
    out[2] = in.limbs[2];
    out[3] = in.limbs[3];
}

static inline bool multiplyScalarBy10Checked(Scalar256* value) {
    __uint128_t carry = 0;
    for (int i = 0; i < 4; i++) {
        carry += (__uint128_t)value->limbs[i] * 10;
        value->limbs[i] = (uint64_t)carry;
        carry >>= 64;
    }
    return carry == 0;
}

static inline bool addDigitChecked(Scalar256* value, uint8_t digit) {
    __uint128_t carry = digit;
    for (int i = 0; i < 4; i++) {
        carry += value->limbs[i];
        value->limbs[i] = (uint64_t)carry;
        carry >>= 64;
        if (!carry) return true;
    }
    return carry == 0;
}

static inline bool parseDecimalScalarStrict(const char* input, Scalar256* out, std::string* error) {
    if (!input || !*input) {
        if (error) *error = "Decimal scalar input is empty.";
        return false;
    }

    scalarSetZero(out);
    bool sawDigit = false;
    for (size_t i = 0; input[i] != '\0'; i++) {
        unsigned char ch = (unsigned char)input[i];
        if (ch == ',' || ch == '_') continue;
        if (ch < '0' || ch > '9') {
            if (error) *error = "Decimal scalar contains invalid characters.";
            return false;
        }
        sawDigit = true;
        if (!multiplyScalarBy10Checked(out) || !addDigitChecked(out, (uint8_t)(ch - '0'))) {
            if (error) *error = "Decimal scalar overflows 256 bits.";
            return false;
        }
    }

    if (!sawDigit) {
        if (error) *error = "Decimal scalar contains no digits.";
        return false;
    }
    if (scalarIsZero(*out)) {
        if (error) *error = "Scalar must be non-zero.";
        return false;
    }
    if (scalarCmp(*out, SECP_N) >= 0) {
        if (error) *error = "Scalar must be strictly less than secp256k1 group order n.";
        return false;
    }

    return true;
}

static inline bool saveCheckpointV2(
    const char* path,
    const CheckpointHeaderV2& header,
    const ThreadScalarState* threadStates,
    size_t threadCount
) {
    FILE* fp = fopen(path, "wb");
    if (!fp) return false;

    bool ok = true;
    ok &= fwrite(&header, sizeof(header), 1, fp) == 1;
    ok &= fwrite(threadStates, sizeof(ThreadScalarState), threadCount, fp) == threadCount;
    fclose(fp);
    return ok;
}

static inline bool loadCheckpointV2(
    const char* path,
    CheckpointHeaderV2* header,
    ThreadScalarState* threadStates,
    size_t expectedThreadCount
) {
    FILE* fp = fopen(path, "rb");
    if (!fp) return false;

    bool ok = true;
    ok &= fread(header, sizeof(*header), 1, fp) == 1;
    if (!ok) {
        fclose(fp);
        return false;
    }

    if (header->magic != K3_CHECKPOINT_MAGIC ||
        header->version != K3_CHECKPOINT_VERSION ||
        header->threadCount != expectedThreadCount) {
        fclose(fp);
        return false;
    }

    ok &= fread(threadStates, sizeof(ThreadScalarState), expectedThreadCount, fp) == expectedThreadCount;
    fclose(fp);
    return ok;
}

static inline bool deriveExactScalarForCandidate(
    Scalar256* out,
    const ThreadScalarState& threadState,
    int32_t pointDelta,
    uint8_t yVariant,
    uint8_t endoVariant
) {
    Scalar256 candidateScalar;
    if (pointDelta >= 0) {
        addU64ToScalarModN(&candidateScalar, threadState.windowCenter, (uint64_t)pointDelta);
    } else {
        subU64FromScalarModN(&candidateScalar, threadState.windowCenter, (uint64_t)(-(int64_t)pointDelta));
    }

    if (yVariant != 0) {
        Scalar256 negated;
        negateScalarModN(&negated, candidateScalar);
        candidateScalar = negated;
    }

    switch (endoVariant) {
        case 0:
            *out = candidateScalar;
            return true;
        case 1:
            mulScalarModN(out, candidateScalar, SECP_LAMBDA_BETA);
            return true;
        case 2:
            mulScalarModN(out, candidateScalar, SECP_LAMBDA_BETA2);
            return true;
        default:
            return false;
    }
}

#endif // K3_SEARCH_STATE_H
