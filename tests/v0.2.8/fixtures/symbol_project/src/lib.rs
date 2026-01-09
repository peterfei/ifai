pub trait DataProcessor {
    fn process(&self, data: String) -> Result<(), String>;
}

pub struct User {
    pub id: u64,
    pub name: String,
}

impl User {
    pub fn new(id: u64, name: String) -> Self {
        Self { id, name }
    }
}

pub mod auth {
    use super::User;
    
    pub struct Session {
        pub token: String,
        pub user: User,
    }
    
    impl crate::DataProcessor for Session {
        fn process(&self, data: String) -> Result<(), String> {
            println!("Processing session for {}: {}", self.user.name, data);
            Ok(())
        }
    }
}
