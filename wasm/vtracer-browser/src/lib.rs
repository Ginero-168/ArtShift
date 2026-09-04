//! Browser-facing WebAssembly adapter for the official VisionCortex VTracer core.
//!
//! ArtShift decodes and resizes the image in its existing browser Worker. This
//! binding deliberately accepts raw RGBA8 pixels only, so it has no Node.js,
//! filesystem, DOM, or native image-decoder dependency.

use serde::Deserialize;
use vtracer::{Color, ColorImage, Config};
use wasm_bindgen::prelude::*;

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Options {
    preset: Option<String>,
    clustering: Option<String>,
    hierarchical: Option<String>,
    mode: Option<String>,
    filter_speckle: Option<usize>,
    color_precision: Option<i32>,
    layer_difference: Option<i32>,
    corner_threshold: Option<i32>,
    length_threshold: Option<f64>,
    max_iterations: Option<usize>,
    splice_threshold: Option<i32>,
    simplify: Option<f64>,
    path_precision: Option<u32>,
    palette: Option<Vec<String>>,
    max_colors: Option<usize>,
    optimize: Option<u8>,
    binary_threshold: Option<u8>,
    adaptive: Option<bool>,
    adaptive_window: Option<u32>,
    adaptive_t: Option<f64>,
    watershed_detail: Option<u32>,
}

fn js_error(message: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&message.to_string())
}

fn parse_hex(value: &str) -> Result<Color, JsValue> {
    let token = value.strip_prefix('#').unwrap_or(value);
    if token.len() != 6 {
        return Err(js_error(format!("`{value}` is not a #rrggbb color")));
    }
    let channel = |range: std::ops::Range<usize>| {
        u8::from_str_radix(&token[range], 16)
            .map_err(|_| js_error(format!("`{value}` is not a #rrggbb color")))
    };
    Ok(Color::new(channel(0..2)?, channel(2..4)?, channel(4..6)?))
}

fn config_from(options: JsValue) -> Result<Config, JsValue> {
    let options: Options = if options.is_undefined() || options.is_null() {
        Options::default()
    } else {
        serde_wasm_bindgen::from_value(options).map_err(js_error)?
    };

    let mut config = match options.preset.as_deref() {
        Some("bw") => Config::from_preset(vtracer::Preset::Bw),
        Some("poster") => Config::from_preset(vtracer::Preset::Poster),
        Some("photo") => Config::from_preset(vtracer::Preset::Photo),
        Some(other) => return Err(js_error(format!("unknown VTracer preset `{other}`"))),
        None => Config::default(),
    };

    if let Some(value) = options.clustering {
        config.clustering = value.parse().map_err(js_error)?;
    }
    if let Some(value) = options.hierarchical {
        config.hierarchical = value.parse().map_err(js_error)?;
    }
    if let Some(value) = options.mode {
        config.mode = value.parse().map_err(js_error)?;
    }
    if let Some(value) = options.filter_speckle {
        config.filter_speckle = value;
    }
    if let Some(value) = options.color_precision {
        config.color_precision = value;
    }
    if let Some(value) = options.layer_difference {
        config.layer_difference = value;
    }
    if let Some(value) = options.corner_threshold {
        config.corner_threshold = value;
    }
    if let Some(value) = options.length_threshold {
        config.length_threshold = value;
    }
    if let Some(value) = options.max_iterations {
        config.max_iterations = value;
    }
    if let Some(value) = options.splice_threshold {
        config.splice_threshold = value;
    }
    if let Some(value) = options.simplify {
        config.simplify = Some(value);
    }
    if let Some(value) = options.path_precision {
        config.path_precision = Some(value);
    }
    if let Some(values) = options.palette {
        config.palette = values
            .iter()
            .map(|value| parse_hex(value))
            .collect::<Result<Vec<_>, _>>()?;
    }
    if let Some(value) = options.max_colors {
        config.max_colors = Some(value);
    }
    if let Some(value) = options.optimize {
        config.optimize = value;
    }
    if let Some(value) = options.binary_threshold {
        config.binary_threshold = value;
    }
    if options.adaptive == Some(true)
        || options.adaptive_window.is_some()
        || options.adaptive_t.is_some()
    {
        config.binary_adaptive = true;
    }
    if let Some(value) = options.adaptive_window {
        config.binary_adaptive_window = value;
    }
    if let Some(value) = options.adaptive_t {
        config.binary_adaptive_t = value;
    }
    if let Some(value) = options.watershed_detail {
        config.watershed_detail = value;
    }

    Ok(config)
}

/// Convert raw RGBA8 pixels to an SVG string using the official VTracer core.
#[wasm_bindgen]
pub fn vectorize_rgba(
    pixels: Vec<u8>,
    width: usize,
    height: usize,
    options: JsValue,
) -> Result<String, JsValue> {
    let expected = width
        .checked_mul(height)
        .and_then(|size| size.checked_mul(4))
        .ok_or_else(|| js_error("Image dimensions are too large."))?;
    if pixels.len() != expected {
        return Err(js_error(format!(
            "RGBA length {} does not equal width*height*4 ({expected}).",
            pixels.len()
        )));
    }

    let config = config_from(options)?;
    config
        .build()
        .map_err(js_error)?
        .to_svg(&ColorImage {
            pixels,
            width,
            height,
        })
        .map_err(js_error)
}
