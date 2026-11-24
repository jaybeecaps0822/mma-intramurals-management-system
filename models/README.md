# Local face verification models

The server runs these OpenCV Zoo models with ONNX Runtime WASM on CPU. No student photos or templates are sent to an external API. Files were downloaded from revision [`48b10fa505aeb51fbd127fc60a5c660040e823b7`](https://github.com/opencv/opencv_zoo/tree/48b10fa505aeb51fbd127fc60a5c660040e823b7/models); the LFS SHA-256 values were checked against that revision.

| File | SHA-256 | License |
|---|---|---|
| `face_detection_yunet_2023mar.onnx` | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | [MIT](LICENSE-YuNet.txt) |
| `face_recognition_sface_2021dec_int8.onnx` | `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a` | [Apache 2.0](LICENSE-SFace.txt) |

YuNet detects faces and five landmarks. SFace produces a 128-number normalized template from one aligned face. Matching is one-to-one against the signed-in student's encrypted template, not against the student population. The operating threshold is a starting point and requires school-specific validation. These models do not perform liveness or presentation attack detection. The staff-operated workflow and QR/card alternatives remain important. Do not place this folder under `public/`.
