//! `PRODUCT_NAME` is the same name as `tauri.conf.json` (`productName`, main window `title`) -- SPEC-0300-0015 R-423.
//! (No JSON crate is a direct dependency, so the text of the config is searched for the exact `"key": "value"` pairs.)

use super::product::PRODUCT_NAME;

const CONF: &str = include_str!("../../tauri.conf.json");

#[test]
fn product_name_is_guif() {
    assert_eq!(PRODUCT_NAME, "guif");
}

#[test]
fn product_name_equals_the_conf_product_name_and_main_title() {
    assert!(CONF.contains(&format!("\"productName\": \"{PRODUCT_NAME}\"")));
    assert!(CONF.contains(&format!("\"title\": \"{PRODUCT_NAME}\"")));
}
