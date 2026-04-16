#!/bin/bash
# K3 Search - Specific Decimal Ranges for 115 Target Addresses
# All targets verified in LoyceClub dataset (k3-generated-loyce/targets.exact)

set -e

# Configuration
BINARY="${K3_BINARY:-/workspace/k3/BloomSearch32K3}"
WORK_DIR="${K3_WORK_DIR:-/tmp/k3_search_$$}"

# LoyceClub production targets
PREFIX="/workspace/k3-generated-loyce/prefix.bin"
BLOOM="/workspace/k3-generated-loyce/bloom.bin"
SEEDS="/workspace/k3-generated-loyce/seeds.bin"
BITS="4294967296"
TARGETS_EXACT="/workspace/k3-generated-loyce/targets.exact"

# Geometry - full production
BLOCKS="${K3_BLOCKS:-256}"
THREADS="${K3_THREADS:-256}"

# Search ranges (4 ranges for 4 GPUs)
# Range 1: 82,992,563,620,862,434,352,475,351,947,757,081,565,902,246,292,157,501,334,072,000,000,000,000,000,000
#          to 82,992,563,620,862,434,352,475,351,947,757,081,565,902,246,292,157,501,334,072,964,625,845,178,451,573
# Range 2: 32,962,630,077,724,664,883,873,325,027,190,932,397,949,073,399,633,288,316,330,719,255,830,000,000,000
#          to 32,962,630,077,724,664,883,873,325,027,190,932,397,949,073,399,633,288,316,330,819,255,830,000,000,000
# Range 3: 81,979,563,453,356,770,746,037,359,084,754,162,925,559,246,477,171,714,229,961,496,311,613,000,000,000
#          to 81,979,563,453,356,770,746,037,359,084,754,162,925,559,246,477,171,714,229,961,596,311,613,000,000,000
# Range 4: 29,479,457,787,340,596,289,501,814,413,357,046,005,087,906,302,230,729,430,463,137,099,538,000,000,000
#          to 29,479,457,787,340,596,289,501,814,413,357,046,005,087,906,302,230,729,430,463,237,099,538,000,000,000

declare -a START_RANGES=(
    "82992563620862434352475351947757081565902246292157501334072000000000000000000"
    "32962630077724664883873325027190932397949073399288316330719255830000000000"
    "81979563453356770746037359084754162925592464771714229961496311613000000000"
    "29479457787340596289501814413357046005087906302230729430463137099538000000000"
)

# Create working directory
mkdir -p "$WORK_DIR"
echo "Working directory: $WORK_DIR"
echo "Binary: $BINARY"
echo ""

# Verify binary
if [ ! -f "$BINARY" ]; then
    echo "Error: Binary not found at $BINARY"
    exit 1
fi

# Verify target files
for f in "$PREFIX" "$BLOOM" "$SEEDS" "$TARGETS_EXACT"; do
    if [ ! -f "$f" ]; then
        echo "Error: Required file not found: $f"
        exit 1
    fi
    size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo "unknown")
    echo "  $f ($size bytes)"
done
echo ""

# Detect GPUs
GPU_COUNT=$(nvidia-smi -L 2>/dev/null | wc -l)
if [ "$GPU_COUNT" -eq 0 ]; then
    echo "Error: No GPUs detected"
    exit 1
fi
echo "Detected $GPU_COUNT GPUs"
echo "Using $BLOCKS blocks x $THREADS threads = $((BLOCKS * THREADS)) total threads per GPU"
echo ""

# Kill existing
pkill -f "$(basename "$BINARY")" 2>/dev/null || true
sleep 2

# Launch on each GPU
echo "=== Launching K3 Search ==="
PIDS=()
for ((i=0; i<GPU_COUNT && i<${#START_RANGES[@]}; i++)); do
    GPU_ID=$i
    STATE_FILE="$WORK_DIR/gpu${GPU_ID}.state"
    LOG_FILE="$WORK_DIR/gpu${GPU_ID}.log"
    START="${START_RANGES[$i]}"
    
    echo ""
    echo "GPU $GPU_ID:"
    echo "  Start: $START"
    echo "  State: $STATE_FILE"
    echo "  Log: $LOG_FILE"
    
    nohup "$BINARY" \
        -prefix "$PREFIX" \
        -bloom "$BLOOM" \
        -seeds "$SEEDS" \
        -bits "$BITS" \
        -targets-exact "$TARGETS_EXACT" \
        -gpu "$GPU_ID" \
        -blocks "$BLOCKS" \
        -threads-per-block "$THREADS" \
        -state "$STATE_FILE" \
        -start "$START" \
        > "$LOG_FILE" 2>&1 &
    
    PID=$!
    PIDS+=($PID)
    echo "  PID: $PID"
    
    sleep 3  # Stagger launches
done

echo ""
echo "=== All GPUs Launched ==="
echo "PIDs: ${PIDS[*]}"
echo ""
echo "Monitoring..."
echo ""

# Monitor loop
monitor() {
    local duration=${1:-60}
    local interval=${2:-10}
    local elapsed=0
    
    while [ $elapsed -lt $duration ]; do
        echo "--- $(date +%H:%M:%S) ---"
        RUNNING=0
        for ((i=0; i<GPU_COUNT && i<${#START_RANGES[@]}; i++)); do
            LOG_FILE="$WORK_DIR/gpu${i}.log"
            if pgrep -f "gpu${i}.state" > /dev/null 2>&1; then
                RUNNING=$((RUNNING + 1))
                # Get last progress line
                progress=$(grep -E '\[K3.*GKey' "$LOG_FILE" 2>/dev/null | tail -1 || echo "starting...")
                echo "GPU $i: $progress"
            else
                echo "GPU $i: STOPPED"
                tail -5 "$LOG_FILE" 2>/dev/null | head -3
            fi
        done
        echo "Running: $RUNNING/$GPU_COUNT"
        echo ""
        
        sleep $interval
        elapsed=$((elapsed + interval))
    done
}

# Monitor for specified duration
monitor "${K3_MONITOR_TIME:-60}" "${K3_MONITOR_INTERVAL:-10}"

echo ""
echo "=== Search Status ==="
echo "Work directory: $WORK_DIR"
echo ""
echo "To view logs: tail -f $WORK_DIR/gpu*.log"
echo "To stop all:  pkill -f $(basename "$BINARY")"
echo ""
echo "GPU Status:"
for ((i=0; i<GPU_COUNT && i<${#START_RANGES[@]}; i++)); do
    if pgrep -f "gpu${i}.state" > /dev/null 2>&1; then
        echo "  GPU $i: RUNNING"
        grep -E 'candidate|CONFIRMED' "$WORK_DIR/gpu${i}.log" 2>/dev/null | tail -3 | sed 's/^/    /'
    else
        echo "  GPU $i: STOPPED"
    fi
done
