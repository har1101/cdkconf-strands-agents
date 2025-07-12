#!/bin/bash

# Lambda Layer setup script for Strands Agents
set -e

LAYER_DIR="python"
mkdir -p $LAYER_DIR

# Install dependencies
pip install -r requirements.txt -t $LAYER_DIR

# Clean up unnecessary files
find $LAYER_DIR -type d -name "__pycache__" -exec rm -rf {} +
find $LAYER_DIR -name "*.pyc" -delete
find $LAYER_DIR -name "*.pyo" -delete

echo "Strands Agents Lambda layer prepared successfully"