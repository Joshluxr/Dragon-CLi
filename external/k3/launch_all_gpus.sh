#!/bin/bash
# Launch K3 on all 8 GPUs with specified decimal starting ranges
# Each GPU gets a unique starting point to avoid overlap

# Configuration - adjust these paths as needed
BINARY="./BloomSearch32K3"
PREFIX_FILE="/data/prefix32.bin"
BLOOM_FILE="/data/bloom_filter.bin"
SEEDS_FILE="/data/bloom_seeds.bin"
BITS="8589934592"  # Adjust based on your bloom filter size

# The 8 decimal starting ranges (no end, each GPU starts here)
declare -a STARTS=(
    "82992563620862434352475351947757081565902246292157501334072464625845000000000"
    "83006381551614476668704001704925337411013586345448656596844062026379000000000"
    "56250958961391727996141955054393623146377586413781665198566261449216000000000"
    "55759889748939984167476976690990381959594369969782570707259939409534000000000"
    "81344397156153394613998188530327581501124344310299587598256439929703000000000"
    "81979563453356770746037359084754162925559246477171714229961496311613000000000"
    "7905764002027863378760312975829580808151779176516965379126368541744000000000"
    "114942193531081435629910684111945095323508319876805002546292215567443000000000"
)

# Kill any existing K3 processes
echo "Stopping any existing K3 processes..."
pkill -f BloomSearch32K3 2>/dev/null
sleep 2

# Check if binary exists
if [ ! -f "$BINARY" ]; then
    echo "Error: Binary not found at $BINARY"
    echo "Please build first with: make"
    exit 1
fi

# Check if required files exist
for FILE in "$PREFIX_FILE" "$BLOOM_FILE" "$SEEDS_FILE"; do
    if [ ! -f "$FILE" ]; then
        echo "Warning: Required file not found: $FILE"
        echo "Please update the paths in this script."
        exit 1
    fi
done

# Launch each GPU with its starting range
echo "Launching K3 on 8 GPUs with decimal starting ranges..."
echo ""

for i in {0..7}; do
    START="${STARTS[$i]}"
    LOG_FILE="/tmp/k3_gpu${i}.log"
    STATE_FILE="/tmp/gpu${i}_k3_decimal.state"

    echo "GPU $i: Starting at $START"

    nohup $BINARY \
        -gpu $i \
        -prefix "$PREFIX_FILE" \
        -bloom "$BLOOM_FILE" \
        -seeds "$SEEDS_FILE" \
        -bits "$BITS" \
        -start "$START" \
        -state "$STATE_FILE" \
        -both \
        > "$LOG_FILE" 2>&1 &

    echo "  PID: $!"
    echo "  Log: $LOG_FILE"
    echo ""
done

echo "All GPUs launched!"
echo ""
echo "Monitor with:"
echo "  tail -f /tmp/k3_gpu*.log"
echo ""
echo "Check GPU usage:"
echo "  nvidia-smi"
echo ""
echo "Stop all:"
echo "  pkill -f BloomSearch32K3"
