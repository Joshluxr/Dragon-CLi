#!/bin/bash
# K3 Multi-GPU Launch Script - Production Ready
# Launches K3 on all 8 GPUs with proper isolation

set -e

# Configuration
BINARY="${K3_BINARY:-./BloomSearch32K3}"
WORK_DIR="${K3_WORK_DIR:-/tmp/k3_run_$$}"

# Target files - adjust for your use case
# For testing with open fixtures:
TEST_PREFIX="${K3_PREFIX:-/workspace/k3-testdata-open/prefix.bin}"
TEST_BLOOM="${K3_BLOOM:-/workspace/k3-testdata-open/bloom.bin}"
TEST_SEEDS="${K3_SEEDS:-/workspace/k3-testdata-open/seeds.bin}"
TEST_BITS="${K3_BITS:-1048576}"

# For production with LoyceClub targets:
# PROD_PREFIX="/workspace/k3-generated-loyce/prefix.bin"
# PROD_BLOOM="/workspace/k3-generated-loyce/bloom.bin"
# PROD_SEEDS="/workspace/k3-generated-loyce/seeds.bin"
# PROD_BITS="4294967296"
# PROD_TARGETS="/workspace/k3-generated-loyce/targets.exact"

# Use production or test based on K3_MODE env var
if [ "${K3_MODE:-test}" = "production" ]; then
    PREFIX="${PROD_PREFIX:-$TEST_PREFIX}"
    BLOOM="${PROD_BLOOM:-$TEST_BLOOM}"
    SEEDS="${PROD_SEEDS:-$TEST_SEEDS}"
    BITS="${PROD_BITS:-$TEST_BITS}"
    TARGETS_EXACT="${K3_TARGETS_EXACT:-$PROD_TARGETS}"
else
    PREFIX="$TEST_PREFIX"
    BLOOM="$TEST_BLOOM"
    SEEDS="$TEST_SEEDS"
    BITS="$TEST_BITS"
    TARGETS_EXACT="${K3_TARGETS_EXACT:-}"
fi

# Geometry settings
BLOCKS="${K3_BLOCKS:-256}"
THREADS="${K3_THREADS:-256}"

# Decimal start ranges for each GPU (customize these for your search)
# These should be non-overlapping windows
# Max valid: 115792089237316195423570985008687907852837564279074904382605163141518161494336 (secp256k1 order - 1)
declare -a START_RANGES=(
    "${K3_START_0:-1}"
    "${K3_START_1:-10000000000000000000000000000000000000000000000000}"
    "${K3_START_2:-20000000000000000000000000000000000000000000000000}"
    "${K3_START_3:-30000000000000000000000000000000000000000000000000}"
    "${K3_START_4:-40000000000000000000000000000000000000000000000000}"
    "${K3_START_5:-50000000000000000000000000000000000000000000000000}"
    "${K3_START_6:-60000000000000000000000000000000000000000000000000}"
    "${K3_START_7:-70000000000000000000000000000000000000000000000000}"
)

# Create working directory
mkdir -p "$WORK_DIR"
echo "Working directory: $WORK_DIR"

# Verify binary exists
if [ ! -f "$BINARY" ]; then
    echo "Error: Binary not found at $BINARY"
    echo "Please build with: make CCAP=120"
    exit 1
fi

# Verify input files
for f in "$PREFIX" "$BLOOM" "$SEEDS"; do
    if [ ! -f "$f" ]; then
        echo "Error: Required file not found: $f"
        exit 1
    fi
done

# Kill any existing K3 processes
echo "Stopping any existing K3 processes..."
pkill -f "$(basename "$BINARY")" 2>/dev/null || true
sleep 2

# Detect number of GPUs
GPU_COUNT=$(nvidia-smi -L 2>/dev/null | wc -l)
if [ "$GPU_COUNT" -eq 0 ]; then
    echo "Error: No GPUs detected"
    exit 1
fi
echo "Detected $GPU_COUNT GPUs"

# Launch configuration
echo ""
echo "=== Launch Configuration ==="
echo "Binary: $BINARY"
echo "Blocks: $BLOCKS"
echo "Threads: $THREADS"
echo "Total threads per GPU: $((BLOCKS * THREADS))"
echo "Bloom bits: $BITS"
echo "Targets exact: ${TARGETS_EXACT:-<none>}"
echo "Mode: ${K3_MODE:-test}"
echo ""

# Launch on each GPU
PIDS=()
for ((i=0; i<GPU_COUNT; i++)); do
    GPU_ID=$i
    STATE_FILE="$WORK_DIR/gpu${GPU_ID}.state"
    LOG_FILE="$WORK_DIR/gpu${GPU_ID}.log"
    
    # Build command
    CMD="$BINARY"
    CMD="$CMD -prefix $PREFIX"
    CMD="$CMD -bloom $BLOOM"
    CMD="$CMD -seeds $SEEDS"
    CMD="$CMD -bits $BITS"
    CMD="$CMD -gpu $GPU_ID"
    CMD="$CMD -blocks $BLOCKS"
    CMD="$CMD -threads-per-block $THREADS"
    CMD="$CMD -state $STATE_FILE"
    
    # Add start range if specified
    if [ -n "${START_RANGES[$i]}" ]; then
        CMD="$CMD -start ${START_RANGES[$i]}"
    fi
    
    # Add targets-exact if specified
    if [ -n "$TARGETS_EXACT" ]; then
        CMD="$CMD -targets-exact $TARGETS_EXACT"
    fi
    
    echo "Launching GPU $GPU_ID..."
    echo "  State: $STATE_FILE"
    echo "  Log: $LOG_FILE"
    echo "  Start: ${START_RANGES[$i]:-<random>}"
    
    # Launch with nohup
    nohup $CMD > "$LOG_FILE" 2>&1 &
    PID=$!
    PIDS+=($PID)
    echo "  PID: $PID"
    
    # Small delay to stagger launches and reduce initial resource contention
    sleep 2
done

echo ""
echo "=== All $GPU_COUNT GPUs Launched ==="
echo "PIDs: ${PIDS[*]}"
echo ""

# Monitor function
monitor() {
    echo "Monitoring for ${1:-30} seconds..."
    sleep "${1:-30}"
    
    echo ""
    echo "=== Status Check ==="
    RUNNING=0
    for ((i=0; i<GPU_COUNT; i++)); do
        LOG_FILE="$WORK_DIR/gpu${i}.log"
        if pgrep -f "gpu${i}.state" > /dev/null 2>&1; then
            echo "GPU $i: RUNNING"
            RUNNING=$((RUNNING + 1))
            # Show last few lines
            echo "  Last output:"
            tail -3 "$LOG_FILE" 2>/dev/null | sed 's/^/    /'
        else
            echo "GPU $i: STOPPED"
            echo "  Exit log:"
            tail -10 "$LOG_FILE" 2>/dev/null | sed 's/^/    /'
        fi
        echo ""
    done
    
    echo "Total running: $RUNNING/$GPU_COUNT"
}

# If run in monitor mode, wait and show status
if [ "${K3_MONITOR:-1}" = "1" ]; then
    monitor "${K3_MONITOR_TIME:-30}"
fi

echo ""
echo "Working directory: $WORK_DIR"
echo "To stop all processes: pkill -f $(basename "$BINARY")"
echo "To view logs: tail -f $WORK_DIR/gpu*.log"
