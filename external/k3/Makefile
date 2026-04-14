# K3 Optimized Bloom Filter Bitcoin Address Search
# Performance-optimized version with memory coalescing and warp-level atomics

CUDA = /usr/local/cuda
NVCC = $(CUDA)/bin/nvcc
CXX = g++

# Compute capability - adjust for your GPU
# 89 = RTX 4090, 86 = RTX 3090, 80 = A100, 75 = RTX 2080
CCAP ?= 89

CXXFLAGS = -O3 -std=c++17 -pthread -I$(CUDA)/include
NVCCFLAGS = -O3 -std=c++17 \
	-gencode=arch=compute_$(CCAP),code=sm_$(CCAP) \
	--compiler-options -fPIC \
	-I. \
	--use_fast_math \
	-Xptxas -v \
	--maxrregcount=64

LDFLAGS = -L$(CUDA)/lib64 -lcudart -lpthread

# Debug flags for profiling
NVCCFLAGS_DEBUG = $(NVCCFLAGS) -lineinfo -G

all: BloomSearch32K3

# K3-Optimized version with:
# - Memory coalescing for better bandwidth utilization
# - Reduced register pressure (256 threads/block)
# - Warp-level atomics for reduced contention
# - Power-of-2 bloom filter for fast bitmask
# - Symmetric hash for both address parities
# - Pinned memory for faster host<->device transfers
BloomSearch32K3: src/BloomSearch32K3.cu GPUGroup.h GPUMath.h GPUMath_K3.h GPUHash.h
	$(NVCC) $(NVCCFLAGS) -o BloomSearch32K3 src/BloomSearch32K3.cu $(LDFLAGS)

# Debug build for profiling with nsys/ncu
debug: src/BloomSearch32K3.cu GPUGroup.h GPUMath.h GPUMath_K3.h GPUHash.h
	$(NVCC) $(NVCCFLAGS_DEBUG) -o BloomSearch32K3_debug src/BloomSearch32K3.cu $(LDFLAGS)

# Profile targets
profile-nsys: BloomSearch32K3
	nsys profile -t cuda,nvtx -o k3_profile ./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -bits 334945032 -gpu 0

profile-ncu: BloomSearch32K3
	ncu --set full -o k3_kernel_profile ./BloomSearch32K3 -prefix bloom.prefix32 -bloom bloom.bloom -bits 334945032 -gpu 0

# Multi-GPU capability detection
CCAP_LIST = 75 80 86 89

multi-arch: src/BloomSearch32K3.cu GPUGroup.h GPUMath.h GPUMath_K3.h GPUHash.h
	$(NVCC) -O3 -std=c++17 \
		-gencode=arch=compute_75,code=sm_75 \
		-gencode=arch=compute_80,code=sm_80 \
		-gencode=arch=compute_86,code=sm_86 \
		-gencode=arch=compute_89,code=sm_89 \
		--compiler-options -fPIC -I. --use_fast_math \
		-o BloomSearch32K3_multi src/BloomSearch32K3.cu $(LDFLAGS)

clean:
	rm -f BloomSearch32K3 BloomSearch32K3_debug BloomSearch32K3_multi *.o *.qdrep *.nsys-rep *.ncu-rep

.PHONY: all clean debug profile-nsys profile-ncu multi-arch
