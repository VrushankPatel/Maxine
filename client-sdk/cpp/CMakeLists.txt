cmake_minimum_required(VERSION 3.16)
project(maxine-client-cpp VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find packages
find_package(PkgConfig REQUIRED)
pkg_check_modules(CPP_HTTPLIB REQUIRED cpp-httplib)
pkg_check_modules(NLOHMANN_JSON REQUIRED nlohmann_json)

# Create library
add_library(maxine-client
    MaxineClient.cpp
)

target_include_directories(maxine-client PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CPP_HTTPLIB_INCLUDE_DIRS}
    ${NLOHMANN_JSON_INCLUDE_DIRS}
)

target_link_libraries(maxine-client
    ${CPP_HTTPLIB_LIBRARIES}
    ${NLOHMANN_JSON_LIBRARIES}
)

# Create executable example
add_executable(maxine-client-example
    example.cpp
)

target_link_libraries(maxine-client-example
    maxine-client
)

# Install
install(TARGETS maxine-client
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

install(FILES MaxineClient.hpp
    DESTINATION include/maxine
)