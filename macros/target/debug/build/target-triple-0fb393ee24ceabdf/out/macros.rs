/// Produces the value of TARGET as a string literal.
#[macro_export]
macro_rules! target {
    () => {
        "x86_64-apple-darwin"
    };
}

/// Produces the value of HOST as a string literal.
#[macro_export]
macro_rules! host {
    () => {
        "x86_64-apple-darwin"
    };
}
