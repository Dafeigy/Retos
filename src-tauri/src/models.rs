use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Component {
    pub id: String,
    pub name: String,
    pub category: String,
    pub package: String,
    pub value: String,
    pub quantity: i64,
    pub min_quantity: Option<i64>,
    pub location: String,
    pub notes: String,
    pub unit_price: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Movement {
    pub id: String,
    pub component_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub quantity: i64,
    pub note: String,
    pub created_at: String,
    #[serde(default)]
    pub component_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StorageBox {
    pub id: String,
    pub label: String,
    pub subtitle: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct BomProject {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_name: String,
    pub rows_json: String,
    pub completed_json: String,
    pub status: String,
    pub start_date: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Deserialize)]
pub struct BomProjectInput {
    pub name: String,
    pub description: String,
    pub file_name: String,
    pub rows_json: String,
    pub start_date: String,
}

#[derive(Deserialize)]
pub struct ComponentInput {
    pub name: String,
    pub category: String,
    pub package: String,
    pub value: String,
    pub quantity: i64,
    pub min_quantity: Option<i64>,
    pub location: String,
    pub notes: String,
    pub unit_price: Option<f64>,
}

#[derive(Deserialize)]
pub struct StorageBoxInput {
    pub label: String,
    pub subtitle: String,
}

impl StorageBoxInput {
    pub fn validate(&self) -> Result<(), String> {
        if self.label.trim().is_empty()
            || self.label.trim().len() > 80
            || self.subtitle.trim().len() > 120
        {
            return Err("请输入有效的盒子名称。".into());
        }
        Ok(())
    }
}

impl ComponentInput {
    pub fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty()
            || self.category.trim().is_empty()
            || self.package.trim().is_empty()
            || self.quantity < 0
            || self.quantity > 9_007_199_254_740_991
            || self
                .min_quantity
                .is_some_and(|v| !(0..=9_007_199_254_740_991).contains(&v))
            || self.unit_price.is_some_and(|v| !v.is_finite() || v < 0.0)
        {
            return Err("请填写完整且有效的元件信息。".into());
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementInput {
    pub component_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub quantity: i64,
    pub note: String,
}

#[derive(Serialize)]
pub struct Snapshot {
    pub components: Vec<Component>,
    pub movements: Vec<Movement>,
    pub boxes: Vec<StorageBox>,
    pub projects: Vec<BomProject>,
    pub pending: i64,
}

#[derive(Default, Serialize)]
pub struct SyncReport {
    pub components: usize,
    pub movements: usize,
    pub boxes: usize,
    pub projects: usize,
    pub preserved: usize,
}
