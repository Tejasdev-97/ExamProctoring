"""
ExamProctor.ai — Optional Development Utility
Exports a trained MobileNetV3-Large PyTorch checkpoint to self-contained ONNX format.
This script is for offline model conversion only and is NEVER run as part of the application.
"""

import argparse
import os
import sys

def export_classifier(checkpoint_path: str, output_path: str, opset_version: int = 18):
    try:
        import torch
        import torch.nn as nn
        import torchvision.models as models
        import onnx
    except ImportError as e:
        print(f"Error: Required Python packages missing: {e}", file=sys.stderr)
        print("Ensure torch, torchvision, and onnx are installed.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(checkpoint_path):
        print(f"Error: Checkpoint file not found: {checkpoint_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading checkpoint: {checkpoint_path}")
    ck = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    classes = ck.get("classes", ["calculator", "cardboard_cutout", "empty_case", "real_phone"])
    print(f"Classifier classes ({len(classes)}): {classes}")

    model = models.mobilenet_v3_large(weights=None)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, len(classes))
    model.load_state_dict(ck["model_state_dict"])
    model.eval()

    dummy = torch.randn(1, 3, 224, 224, dtype=torch.float32)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    print(f"Exporting ONNX graph (Opset {opset_version})...")
    torch.onnx.export(
        model,
        dummy,
        output_path,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
        opset_version=opset_version,
    )

    # Ensure all weights are embedded directly in the .onnx file (no external .data sidecar)
    data_sidecar = output_path + ".data"
    onnx_model = onnx.load(output_path, load_external_data=True)
    for tensor in onnx_model.graph.initializer:
        if tensor.HasField("data_location") and tensor.data_location == onnx.TensorProto.EXTERNAL:
            tensor.ClearField("data_location")
            tensor.ClearField("external_data")
    onnx.save_model(onnx_model, output_path, save_as_external_data=False)
    if os.path.exists(data_sidecar):
        os.remove(data_sidecar)

    onnx.checker.check_model(onnx.load(output_path))
    file_size = os.path.getsize(output_path)
    print(f"ONNX model successfully verified and saved: {output_path} ({file_size} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export MobileNetV3 PyTorch checkpoint to ONNX.")
    parser.add_argument("--checkpoint", type=str, required=True, help="Path to input .pth checkpoint file")
    parser.add_argument("--output", type=str, default="frontend/public/models/phone_classifier.onnx", help="Path to output .onnx file")
    parser.add_argument("--opset", type=int, default=18, help="ONNX opset version (default: 18)")
    args = parser.parse_args()

    export_classifier(args.checkpoint, args.output, args.opset)
