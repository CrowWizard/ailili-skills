//! Map LinkFox `resolution` + `aspectRatio` onto gpt-image-2 `--size`.

const MAX_EDGE: u32 = 3840;
const MIN_PIXELS: u32 = 655_360;
const MAX_PIXELS: u32 = 8_294_400;

pub fn map_image_size(resolution: &str, aspect_ratio: &str) -> Result<String, String> {
    let resolution = resolution.trim().to_ascii_uppercase();
    let aspect = aspect_ratio.trim().replace('：', ":");
    let mapped = match (resolution.as_str(), aspect.as_str()) {
        ("1K", "1:1") => "1024x1024".to_string(),
        ("1K", "16:9") => "1280x720".to_string(),
        ("1K", "9:16") => "720x1280".to_string(),
        ("2K" | "", "1:1") | ("2K", "") => "2048x2048".to_string(),
        ("2K", "16:9") => "2048x1152".to_string(),
        ("2K", "9:16") => "1152x2048".to_string(),
        ("4K", "1:1") => "3840x2160".to_string(),
        ("4K", "16:9") => "3840x2160".to_string(),
        ("4K", "9:16") => "2160x3840".to_string(),
        _ => size_from_custom(&resolution, &aspect)?,
    };
    gpt_image_2_core::parse_image_size(&mapped)
        .map_err(|error| format!("mapped size {mapped} was rejected by the image backend: {error}"))
}

fn size_from_custom(resolution: &str, aspect: &str) -> Result<String, String> {
    let long_edge = match resolution {
        "1K" => 1280,
        "4K" => 3840,
        _ => 2048,
    };
    let (w_ratio, h_ratio) = parse_aspect(aspect)?;
    let (width, height) = if w_ratio >= h_ratio {
        let width = long_edge;
        let height = ((long_edge as u64 * h_ratio as u64) / w_ratio as u64) as u32;
        (width, height.max(16))
    } else {
        let height = long_edge;
        let width = ((long_edge as u64 * w_ratio as u64) / h_ratio as u64) as u32;
        (width.max(16), height)
    };
    Ok(snap_valid(width, height))
}

fn parse_aspect(aspect: &str) -> Result<(u32, u32), String> {
    let (left, right) = aspect
        .split_once(':')
        .ok_or_else(|| format!("unsupported aspectRatio {aspect:?}"))?;
    let width: u32 = left
        .trim()
        .parse()
        .map_err(|_| format!("unsupported aspectRatio {aspect:?}"))?;
    let height: u32 = right
        .trim()
        .parse()
        .map_err(|_| format!("unsupported aspectRatio {aspect:?}"))?;
    if width == 0 || height == 0 {
        return Err(format!("unsupported aspectRatio {aspect:?}"));
    }
    Ok((width, height))
}

fn snap_valid(mut width: u32, mut height: u32) -> String {
    width = round_multiple_16(width).clamp(16, MAX_EDGE);
    height = round_multiple_16(height).clamp(16, MAX_EDGE);
    let mut pixels = width.saturating_mul(height);
    if pixels < MIN_PIXELS {
        let scale = ((MIN_PIXELS as f64) / pixels as f64).sqrt();
        width = round_multiple_16((width as f64 * scale).ceil() as u32).min(MAX_EDGE);
        height = round_multiple_16((height as f64 * scale).ceil() as u32).min(MAX_EDGE);
        pixels = width.saturating_mul(height);
    }
    if pixels > MAX_PIXELS {
        let scale = ((MAX_PIXELS as f64) / pixels as f64).sqrt();
        width = round_multiple_16((width as f64 * scale).floor() as u32).clamp(16, MAX_EDGE);
        height = round_multiple_16((height as f64 * scale).floor() as u32).clamp(16, MAX_EDGE);
    }
    format!("{width}x{height}")
}

fn round_multiple_16(value: u32) -> u32 {
    if value <= 16 {
        return 16;
    }
    ((value + 8) / 16) * 16
}

#[cfg(test)]
mod tests {
    use super::map_image_size;

    #[test]
    fn maps_standard_linkfox_sizes() {
        assert_eq!(map_image_size("1K", "1:1").unwrap(), "1024x1024");
        assert_eq!(map_image_size("2K", "1:1").unwrap(), "2048x2048");
        assert_eq!(map_image_size("2K", "16:9").unwrap(), "2048x1152");
        assert_eq!(map_image_size("4K", "1:1").unwrap(), "3840x2160");
        assert_eq!(map_image_size("4K", "9:16").unwrap(), "2160x3840");
    }

    #[test]
    fn maps_aplus_ratio() {
        let size = map_image_size("2K", "1464:600").unwrap();
        let (w, h) = size.split_once('x').unwrap();
        let w: u32 = w.parse().unwrap();
        let h: u32 = h.parse().unwrap();
        assert_eq!(w % 16, 0);
        assert_eq!(h % 16, 0);
        assert!(w > h);
    }
}
