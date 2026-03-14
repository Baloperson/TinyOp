// tinyset_plus.hpp
#pragma once

#include <iostream>
#include <unordered_map>
#include <unordered_set>
#include <map>
#include <set>
#include <vector>
#include <string>
#include <any>
#include <variant>
#include <functional>
#include <memory>
#include <shared_mutex>
#include <chrono>
#include <random>
#include <cmath>
#include <queue>
#include <stack>
#include <optional>
#include <typeindex>
#include <concepts>
#include <span>
#include <ranges>
#include <bit>
#include <bit>
#include <cstring>

namespace tinyset {

// ==================== TYPE SYSTEM ====================

using Timestamp = uint64_t;
using ProcessID = std::string;

// Value type that can hold anything
class Value {
public:
    using Null = std::monostate;
    using Bool = bool;
    using Int = int64_t;
    using Float = double;
    using String = std::string;
    using Array = std::vector<Value>;
    using Object = std::unordered_map<std::string, Value>;
    
private:
    std::variant<Null, Bool, Int, Float, String, Array, Object> data_;
    
public:
    Value() : data_(Null{}) {}
    Value(Null) : data_(Null{}) {}
    Value(bool b) : data_(b) {}
    Value(int i) : data_(static_cast<Int>(i)) {}
    Value(int64_t i) : data_(i) {}
    Value(double d) : data_(d) {}
    Value(const char* s) : data_(String(s)) {}
    Value(const std::string& s) : data_(s) {}
    Value(std::string&& s) : data_(std::move(s)) {}
    Value(const Array& a) : data_(a) {}
    Value(Array&& a) : data_(std::move(a)) {}
    Value(const Object& o) : data_(o) {}
    Value(Object&& o) : data_(std::move(o)) {}
    
    template<typename T>
    T* get() { return std::get_if<T>(&data_); }
    
    template<typename T>
    const T* get() const { return std::get_if<T>(&data_); }
    
    bool is_null() const { return std::holds_alternative<Null>(data_); }
    bool is_bool() const { return std::holds_alternative<Bool>(data_); }
    bool is_int() const { return std::holds_alternative<Int>(data_); }
    bool is_float() const { return std::holds_alternative<Float>(data_); }
    bool is_string() const { return std::holds_alternative<String>(data_); }
    bool is_array() const { return std::holds_alternative<Array>(data_); }
    bool is_object() const { return std::holds_alternative<Object>(data_); }
    
    template<typename T>
    T as() const { return std::get<T>(data_); }
    
    std::string to_string() const {
        struct Visitor {
            std::string operator()(Null) const { return "null"; }
            std::string operator()(Bool b) const { return b ? "true" : "false"; }
            std::string operator()(Int i) const { return std::to_string(i); }
            std::string operator()(Float f) const { return std::to_string(f); }
            std::string operator()(const String& s) const { return "\"" + s + "\""; }
            std::string operator()(const Array& a) const {
                std::string r = "[";
                for (size_t i = 0; i < a.size(); i++) {
                    if (i > 0) r += ",";
                    r += a[i].to_string();
                }
                return r + "]";
            }
            std::string operator()(const Object& o) const {
                std::string r = "{";
                bool first = true;
                for (const auto& [k, v] : o) {
                    if (!first) r += ",";
                    r += "\"" + k + "\":" + v.to_string();
                    first = false;
                }
                return r + "}";
            }
        };
        return std::visit(Visitor{}, data_);
    }
};

// ==================== AFFINE OPERATIONS ====================

class AffineOp {
    double scale_;
    double shift_;
    
public:
    AffineOp(double scale = 1.0, double shift = 0.0) 
        : scale_(scale), shift_(shift) {}
    
    AffineOp compose(const AffineOp& other) const {
        return AffineOp(
            scale_ * other.scale_,
            scale_ * other.shift_ + shift_
        );
    }
    
    double apply(double x) const {
        return scale_ * x + shift_;
    }
    
    double scale() const { return scale_; }
    double shift() const { return shift_; }
};

// ==================== ITEM ====================

struct Item {
    std::string id;
    std::string type;
    std::optional<double> x;
    std::optional<double> y;
    std::optional<double> width;
    std::optional<double> height;
    std::optional<std::string> content;
    std::vector<std::string> equations;
    std::vector<std::string> contains;
    Timestamp created;
    Timestamp modified;
    Value::Object extra;
    
    Value get(const std::string& key) const {
        if (key == "id") return id;
        if (key == "type") return type;
        if (key == "x" && x) return *x;
        if (key == "y" && y) return *y;
        if (key == "width" && width) return *width;
        if (key == "height" && height) return *height;
        if (key == "content" && content) return *content;
        if (key == "equations") return equations;
        if (key == "contains") return contains;
        if (key == "created") return static_cast<int64_t>(created);
        if (key == "modified") return static_cast<int64_t>(modified);
        
        auto it = extra.find(key);
        if (it != extra.end()) return it->second;
        return Value{};
    }
    
    void set(const std::string& key, const Value& val) {
        if (key == "id") id = *val.get<std::string>();
        else if (key == "type") type = *val.get<std::string>();
        else if (key == "x" && val.is_float()) x = *val.get<double>();
        else if (key == "y" && val.is_float()) y = *val.get<double>();
        else if (key == "width" && val.is_float()) width = *val.get<double>();
        else if (key == "height" && val.is_float()) height = *val.get<double>();
        else if (key == "content" && val.is_string()) content = *val.get<std::string>();
        else if (key == "equations" && val.is_array()) {
            equations.clear();
            for (const auto& v : *val.get<Value::Array>()) {
                if (v.is_string()) equations.push_back(*v.get<std::string>());
            }
        }
        else if (key == "contains" && val.is_array()) {
            contains.clear();
            for (const auto& v : *val.get<Value::Array>()) {
                if (v.is_string()) contains.push_back(*v.get<std::string>());
            }
        }
        else if (key == "created") created = *val.get<int64_t>();
        else if (key == "modified") modified = *val.get<int64_t>();
        else extra[key] = val;
    }
};

// ==================== OPERATION ====================

struct Operation {
    std::string id;
    ProcessID process_id;
    std::map<ProcessID, uint64_t> vector_clock;
    std::string type;
    Value data;
    Timestamp timestamp;
};

// ==================== QUERY ====================

struct Query {
    struct Condition {
        std::optional<double> gt;
        std::optional<double> lt;
        std::optional<double> gte;
        std::optional<double> lte;
        std::optional<std::string> contains;
        std::optional<std::vector<Value>> in;
    };
    
    std::unordered_map<std::string, std::variant<Value, Condition>> criteria;
    std::optional<std::pair<double, double>> near;
    std::optional<double> max_distance;
    
    // Sorting
    std::optional<std::string> sort_field;
    std::vector<std::string> sort_fields;
    bool sort_descending{false};
    
    // Pagination
    size_t limit{0};
    size_t offset{0};
    
    // Return options
    bool count{false};
    bool ids{false};
    bool first{false};
    bool last{false};
};

// ==================== CONFIG ====================

struct Config {
    std::function<std::string()> id_generator = []() {
        static std::random_device rd;
        static std::mt19937 gen(rd());
        static std::uniform_int_distribution<> dis(0, 35);
        static const char* chars = "0123456789abcdefghijklmnopqrstuvwxyz";
        
        auto ts = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        
        std::string rnd(9, '0');
        for (char& c : rnd) c = chars[dis(gen)];
        
        return std::to_string(ts) + "-" + rnd;
    };
    
    bool validate_types{true};
    ProcessID process_id{"process-1"};
    std::unordered_map<std::string, Item> defaults;
};

// ==================== SPATIAL INDEX ====================

class SpatialIndex {
    static constexpr double CELL_SIZE = 100.0;
    
    struct Cell {
        int x, y;
        bool operator==(const Cell&) const = default;
        
        struct Hash {
            size_t operator()(const Cell& c) const {
                return std::hash<int>()(c.x) ^ (std::hash<int>()(c.y) << 1);
            }
        };
    };
    
    std::unordered_map<Cell, std::unordered_set<std::string>, Cell::Hash> grid_;
    
    Cell get_cell(double x, double y) const {
        return Cell{
            static_cast<int>(std::floor(x / CELL_SIZE)),
            static_cast<int>(std::floor(y / CELL_SIZE))
        };
    }
    
public:
    void add(const std::string& id, double x, double y) {
        grid_[get_cell(x, y)].insert(id);
    }
    
    void remove(const std::string& id, double x, double y) {
        auto cell = get_cell(x, y);
        auto it = grid_.find(cell);
        if (it != grid_.end()) {
            it->second.erase(id);
            if (it->second.empty()) grid_.erase(it);
        }
    }
    
    void update(const std::string& id, double old_x, double old_y, double new_x, double new_y) {
        if (get_cell(old_x, old_y) == get_cell(new_x, new_y)) return;
        remove(id, old_x, old_y);
        add(id, new_x, new_y);
    }
    
    std::vector<std::string> query_near(double x, double y, double max_dist) const {
        std::vector<std::string> results;
        Cell center = get_cell(x, y);
        
        int radius_cells = static_cast<int>(std::ceil(max_dist / CELL_SIZE)) + 1;
        
        for (int dx = -radius_cells; dx <= radius_cells; ++dx) {
            for (int dy = -radius_cells; dy <= radius_cells; ++dy) {
                Cell cell{center.x + dx, center.y + dy};
                auto it = grid_.find(cell);
                if (it != grid_.end()) {
                    results.insert(results.end(), it->second.begin(), it->second.end());
                }
            }
        }
        
        return results;
    }
};

// ==================== TRANSACTION ====================

class Transaction {
public:
    using ID = uint64_t;
    
    struct Op {
        enum Type { CREATE, UPDATE, DELETE } type;
        std::string id;
        std::shared_ptr<Item> old_item;
        std::shared_ptr<Item> new_item;
    };
    
private:
    ID id_;
    std::vector<Op> ops_;
    std::function<void()> on_commit_;
    std::function<void()> on_rollback_;
    
public:
    Transaction(ID id, std::function<void()> commit_cb, std::function<void()> rollback_cb)
        : id_(id), on_commit_(std::move(commit_cb)), on_rollback_(std::move(rollback_cb)) {}
    
    ID id() const { return id_; }
    const auto& operations() const { return ops_; }
    
    void record(Op op) { ops_.push_back(std::move(op)); }
    
    void commit() { if (on_commit_) on_commit_(); }
    void rollback() { if (on_rollback_) on_rollback_(); }
};

// ==================== MAIN STORE ====================

class Store {
    using ReadLock = std::shared_lock<std::shared_mutex>;
    using WriteLock = std::unique_lock<std::shared_mutex>;
    
    mutable std::shared_mutex mutex_;
    
    // Core storage
    std::unordered_map<std::string, std::shared_ptr<Item>> items_;
    
    // Indexes
    std::unordered_map<std::string, std::unordered_set<std::string>> type_index_;
    SpatialIndex spatial_index_;
    std::unordered_map<std::string, std::unordered_set<std::string>> tag_index_; // Example extra index
    
    // Event system
    std::unordered_map<std::string, std::vector<std::function<void(const Value&)>>> listeners_;
    
    // Transactions
    std::vector<std::shared_ptr<Transaction>> transaction_stack_;
    
    // Distributed features
    std::vector<Operation> journal_;
    std::vector<std::function<void(const Operation&)>> journal_listeners_;
    std::map<ProcessID, uint64_t> vector_clock_;
    
    // Config
    Config config_;
    
    // Random for IDs
    std::mt19937_64 rng_{std::random_device{}()};
    
public:
    explicit Store(Config config = {}) : config_(std::move(config)) {
        vector_clock_[config_.process_id] = 0;
        init_defaults();
    }
    
private:
    void init_defaults() {
        // Graph default
        Item graph;
        graph.type = "graph";
        graph.x = 0.0;
        graph.y = 0.0;
        graph.width = 400.0;
        graph.height = 300.0;
        config_.defaults["graph"] = std::move(graph);
        
        // Viewport default
        Item viewport;
        viewport.type = "viewport";
        viewport.x = 0.0;
        viewport.y = 0.0;
        viewport.width = 800.0;
        viewport.height = 600.0;
        config_.defaults["viewport"] = std::move(viewport);
        
        // Text default
        Item text;
        text.type = "text";
        text.x = 0.0;
        text.y = 0.0;
        text.width = 300.0;
        text.height = 200.0;
        text.content = "";
        config_.defaults["text"] = std::move(text);
    }
    
    Timestamp now() const {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
    }
    
    void increment_clock() {
        vector_clock_[config_.process_id]++;
    }
    
    std::map<ProcessID, uint64_t> snapshot_clock() const {
        return vector_clock_;
    }
    
    void merge_clock(const std::map<ProcessID, uint64_t>& other) {
        for (const auto& [pid, time] : other) {
            vector_clock_[pid] = std::max(vector_clock_[pid], time);
        }
    }
    
    void record_operation(const std::string& type, Value data) {
        increment_clock();
        
        Operation op;
        op.id = config_.id_generator();
        op.process_id = config_.process_id;
        op.vector_clock = snapshot_clock();
        op.type = type;
        op.data = std::move(data);
        op.timestamp = now();
        
        journal_.push_back(op);
        
        for (const auto& listener : journal_listeners_) {
            listener(op);
        }
    }
    
    void update_indexes(const std::string& action, const std::shared_ptr<Item>& item, 
                       const std::shared_ptr<Item>& old_item = nullptr) {
        if (action == "add" || action == "update") {
            type_index_[item->type].insert(item->id);
            if (item->x && item->y) {
                spatial_index_.add(item->id, *item->x, *item->y);
            }
        }
        
        if (action == "remove" || action == "update") {
            if (old_item) {
                type_index_[old_item->type].erase(old_item->id);
                if (old_item->x && old_item->y) {
                    spatial_index_.remove(old_item->id, *old_item->x, *old_item->y);
                }
            }
        }
        
        if (action == "update" && old_item && item) {
            if (old_item->x && old_item->y && item->x && item->y) {
                spatial_index_.update(item->id, *old_item->x, *old_item->y, *item->x, *item->y);
            }
        }
    }
    
    void emit(const std::string& event, Value data) {
        auto it = listeners_.find(event);
        if (it != listeners_.end()) {
            for (const auto& cb : it->second) {
                try {
                    cb(data);
                } catch (const std::exception& e) {
                    std::cerr << "Event error: " << e.what() << std::endl;
                }
            }
        }
    }
    
    bool matches_criteria(const std::shared_ptr<Item>& item, const Query& query) const {
        for (const auto& [key, condition] : query.criteria) {
            auto val = item->get(key);
            
            if (std::holds_alternative<Value>(condition)) {
                // Direct equality
                const auto& direct = std::get<Value>(condition);
                if (val.to_string() != direct.to_string()) return false;
            } else {
                // Complex condition
                const auto& cond = std::get<Query::Condition>(condition);
                
                if (cond.gt && (!val.is_float() || *val.get<double>() <= *cond.gt)) return false;
                if (cond.lt && (!val.is_float() || *val.get<double>() >= *cond.lt)) return false;
                if (cond.gte && (!val.is_float() || *val.get<double>() < *cond.gte)) return false;
                if (cond.lte && (!val.is_float() || *val.get<double>() > *cond.lte)) return false;
                
                if (cond.contains) {
                    std::string str_val = val.to_string();
                    if (str_val.find(*cond.contains) == std::string::npos) return false;
                }
                
                if (cond.in) {
                    bool found = false;
                    for (const auto& v : *cond.in) {
                        if (val.to_string() == v.to_string()) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) return false;
                }
            }
        }
        return true;
    }
    
    std::vector<std::shared_ptr<Item>> sort_results(
        std::vector<std::shared_ptr<Item>> results, 
        const Query& query) const {
        
        if (query.sort_field) {
            std::sort(results.begin(), results.end(), 
                [&](const auto& a, const auto& b) {
                    auto av = a->get(*query.sort_field);
                    auto bv = b->get(*query.sort_field);
                    
                    if (av.is_float() && bv.is_float()) {
                        return query.sort_descending 
                            ? *av.get<double>() > *bv.get<double>()
                            : *av.get<double>() < *bv.get<double>();
                    }
                    return query.sort_descending 
                        ? av.to_string() > bv.to_string()
                        : av.to_string() < bv.to_string();
                });
        } else if (!query.sort_fields.empty()) {
            std::sort(results.begin(), results.end(),
                [&](const auto& a, const auto& b) {
                    for (const auto& field : query.sort_fields) {
                        auto av = a->get(field);
                        auto bv = b->get(field);
                        
                        if (av.is_float() && bv.is_float()) {
                            if (*av.get<double>() != *bv.get<double>()) {
                                return *av.get<double>() < *bv.get<double>();
                            }
                        } else {
                            auto astr = av.to_string();
                            auto bstr = bv.to_string();
                            if (astr != bstr) return astr < bstr;
                        }
                    }
                    return false;
                });
        }
        
        return results;
    }
    
public:
    // ==================== PUBLIC API ====================
    
    Value create(const Value& spec, const Value::Object& props = {}) {
        WriteLock lock(mutex_);
        
        // Batch creation
        if (spec.is_array()) {
            Value::Array results;
            for (const auto& s : *spec.get<Value::Array>()) {
                if (s.is_array()) {
                    const auto& arr = *s.get<Value::Array>();
                    if (arr.size() >= 1) {
                        Value::Object p;
                        if (arr.size() > 1 && arr[1].is_object()) {
                            p = *arr[1].get<Value::Object>();
                        }
                        results.push_back(create(arr[0], p));
                    }
                } else {
                    results.push_back(create(s, {}));
                }
            }
            return results;
        }
        
        if (!spec.is_string()) return Value{};
        
        std::string type = *spec.get<std::string>();
        std::string id = props.contains("id") && props.at("id").is_string()
            ? *props.at("id").get<std::string>()
            : config_.id_generator();
        
        if (config_.validate_types && !config_.defaults.contains(type)) {
            std::cerr << "Tinyset: Unknown type \"" << type << "\"" << std::endl;
        }
        
        auto item = std::make_shared<Item>();
        
        // Start with defaults
        if (auto it = config_.defaults.find(type); it != config_.defaults.end()) {
            *item = it->second;
        }
        
        item->id = id;
        item->type = type;
        item->created = now();
        item->modified = item->created;
        
        // Apply props
        for (const auto& [k, v] : props) {
            item->set(k, v);
        }
        
        items_[id] = item;
        update_indexes("add", item);
        
        // Emit events
        lock.unlock();
        emit("create", item->id);
        emit("change", Value::Object{{"type", "create"}, {"item", item->id}});
        
        // Record operation
        record_operation("create", Value::Object{
            {"id", id},
            {"item", item->id}  // Simplified - in real code you'd serialize the item
        });
        
        return id;
    }
    
    Value get(const std::variant<std::monostate, std::string, std::vector<std::string>>& identifier,
             const Value::Object& options = {}) const {
        ReadLock lock(mutex_);
        
        // All items
        if (std::holds_alternative<std::monostate>(identifier)) {
            Value::Array results;
            for (const auto& [_, item] : items_) {
                results.push_back(item->id);
            }
            return results;
        }
        
        // Type query
        if (std::holds_alternative<std::string>(identifier)) {
            const auto& id_or_type = std::get<std::string>(identifier);
            if (!items_.contains(id_or_type)) {
                Query q;
                q.criteria["type"] = id_or_type;
                return find(q, options);
            }
        }
        
        // Multiple IDs
        if (std::holds_alternative<std::vector<std::string>>(identifier)) {
            const auto& ids = std::get<std::vector<std::string>>(identifier);
            Value::Array results;
            for (const auto& id : ids) {
                if (auto it = items_.find(id); it != items_.end()) {
                    if (auto exists = options.find("exists"); exists != options.end() && exists->second.is_bool()) {
                        return true;
                    }
                    results.push_back(it->second->id);
                }
            }
            return results;
        }
        
        // Single ID
        if (std::holds_alternative<std::string>(identifier)) {
            const auto& id = std::get<std::string>(identifier);
            auto it = items_.find(id);
            if (it == items_.end()) {
                if (auto exists = options.find("exists"); exists != options.end()) {
                    return false;
                }
                return Value{};
            }
            
            if (auto exists = options.find("exists"); exists != options.end()) {
                return true;
            }
            
            if (auto fields = options.find("fields"); fields != options.end() && fields->second.is_array()) {
                Value::Object result;
                for (const auto& f : *fields->second.get<Value::Array>()) {
                    if (f.is_string()) {
                        auto val = it->second->get(*f.get<std::string>());
                        if (!val.is_null()) {
                            result[*f.get<std::string>()] = val;
                        }
                    }
                }
                return result;
            }
            
            return it->second->id;
        }
        
        return Value{};
    }
    
    Value set(const std::variant<std::string, std::vector<std::string>, Value::Object>& target,
             const std::variant<std::string, Value::Object>& prop_or_props,
             const Value& value = {}, const Value::Object& options = {}) {
        WriteLock lock(mutex_);
        
        // Batch array
        if (std::holds_alternative<std::vector<std::string>>(target)) {
            Value::Array results;
            for (const auto& id : std::get<std::vector<std::string>>(target)) {
                results.push_back(set(id, prop_or_props, value, options));
            }
            return results;
        }
        
        // Object map { id: props }
        if (std::holds_alternative<Value::Object>(target)) {
            Value::Object results;
            for (const auto& [id, props] : std::get<Value::Object>(target)) {
                if (props.is_object()) {
                    results[id] = set(id, *props.get<Value::Object>(), {}, options);
                }
            }
            return results;
        }
        
        // Single item
        std::string id = std::get<std::string>(target);
        auto it = items_.find(id);
        if (it == items_.end()) return Value{};
        
        auto old_item = std::make_shared<Item>(*it->second);
        Value::Object changes;
        
        if (std::holds_alternative<std::string>(prop_or_props) && !value.is_null()) {
            std::string prop = std::get<std::string>(prop_or_props);
            const Value& val = value;
            
            // Relative update
            if (val.is_string()) {
                std::string vstr = *val.get<std::string>();
                if (!vstr.empty() && std::string("+-*/").find(vstr[0]) != std::string::npos) {
                    char op = vstr[0];
                    double amount = std::stod(vstr.substr(1));
                    auto current_val = it->second->get(prop);
                    
                    if (current_val.is_float()) {
                        double current = *current_val.get<double>();
                        if (op == '+') it->second->set(prop, current + amount);
                        else if (op == '-') it->second->set(prop, current - amount);
                        else if (op == '*') it->second->set(prop, current * amount);
                        else if (op == '/') it->second->set(prop, current / amount);
                        
                        changes[prop] = vstr;
                    }
                }
            }
            // Function update (simplified - in real code you'd pass a function object)
            else if (val.is_object() && val.get<Value::Object>()->contains("__fn__")) {
                // This is a placeholder for function application
                // In real implementation, you'd need to marshal functions
            }
            // Deep path
            else if (prop.find('.') != std::string::npos) {
                // Simplified - real implementation would traverse path
                it->second->set(prop, val);
                changes[prop] = val;
            }
            // Normal assignment
            else {
                it->second->set(prop, val);
                changes[prop] = val;
            }
        } else if (std::holds_alternative<Value::Object>(prop_or_props)) {
            // Batch update
            const auto& props = std::get<Value::Object>(prop_or_props);
            changes = props;
            for (const auto& [k, v] : props) {
                set(id, k, v, Value::Object{{"silent", true}});
            }
        }
        
        it->second->modified = now();
        
        // Update spatial index if position changed
        if (changes.contains("x") || changes.contains("y")) {
            update_indexes("update", it->second, old_item);
        }
        
        lock.unlock();
        
        auto silent = options.find("silent");
        if (silent == options.end() || !silent->second.is_bool() || !silent->second.get<bool>()) {
            emit("update", Value::Object{
                {"id", id},
                {"old", old_item->id},
                {"new", it->second->id},
                {"changes", changes}
            });
            emit("change", Value::Object{
                {"type", "update"},
                {"id", id}
            });
        }
        
        record_operation("update", Value::Object{
            {"id", id},
            {"changes", changes}
        });
        
        // Return rollback function (simplified - returns a lambda that can be called)
        return Value::Object{{"__rollback_id", id}};
    }
    
    Value remove(const std::variant<std::string, std::vector<std::string>>& target,
                const Value::Object& options = {}) {
        WriteLock lock(mutex_);
        
        auto dry_run = options.find("dryRun");
        if (dry_run != options.end() && dry_run->second.is_bool() && dry_run->second.get<bool>()) {
            if (std::holds_alternative<std::string>(target)) {
                const auto& id = std::get<std::string>(target);
                if (items_.contains(id)) {
                    return Value::Array{id};
                }
                return Value::Array{};
            }
            Value::Array all_ids;
            for (const auto& [id, _] : items_) {
                all_ids.push_back(id);
            }
            return all_ids;
        }
        
        std::vector<std::shared_ptr<Item>> deleted;
        
        // Delete by type with condition (simplified)
        if (std::holds_alternative<std::string>(target)) {
            const auto& id_or_type = std::get<std::string>(target);
            if (!items_.contains(id_or_type)) {
                // Treat as type query
                Query q;
                q.criteria["type"] = id_or_type;
                if (auto where = options.find("where"); where != options.end() && where->second.is_object()) {
                    for (const auto& [k, v] : *where->second.get<Value::Object>()) {
                        q.criteria[k] = v;
                    }
                }
                
                auto to_delete = find_items(q);
                for (auto& item : to_delete) {
                    if (delete_one(item->id, options)) {
                        deleted.push_back(item);
                    }
                }
                
                Value::Array result;
                for (const auto& item : deleted) {
                    result.push_back(item->id);
                }
                return result;
            }
        }
        
        // Delete by ID(s)
        std::vector<std::string> ids;
        if (std::holds_alternative<std::string>(target)) {
            ids.push_back(std::get<std::string>(target));
        } else {
            ids = std::get<std::vector<std::string>>(target);
        }
        
        for (const auto& id : ids) {
            auto it = items_.find(id);
            if (it != items_.end()) {
                if (delete_one(id, options)) {
                    deleted.push_back(it->second);
                }
            }
        }
        
        Value::Array result;
        for (const auto& item : deleted) {
            result.push_back(item->id);
        }
        return result;
    }
    
    std::vector<std::shared_ptr<Item>> find_items(const Query& query) const {
        ReadLock lock(mutex_);
        
        std::vector<std::shared_ptr<Item>> results;
        
        // Start with type filter if present
        auto type_it = query.criteria.find("type");
        if (type_it != query.criteria.end() && std::holds_alternative<Value>(type_it->second)) {
            const auto& type_val = std::get<Value>(type_it->second);
            if (type_val.is_string()) {
                std::string type = *type_val.get<std::string>();
                auto idx_it = type_index_.find(type);
                if (idx_it != type_index_.end()) {
                    for (const auto& id : idx_it->second) {
                        if (auto item_it = items_.find(id); item_it != items_.end()) {
                            results.push_back(item_it->second);
                        }
                    }
                }
            }
        } else {
            // No type filter, scan all
            for (const auto& [_, item] : items_) {
                results.push_back(item);
            }
        }
        
        // Apply criteria
        if (!query.criteria.empty()) {
            std::erase_if(results, [&](const auto& item) {
                return !matches_criteria(item, query);
            });
        }
        
        // Spatial search
        if (query.near) {
            auto [x, y] = *query.near;
            double max_dist = query.max_distance.value_or(std::numeric_limits<double>::max());
            
            auto nearby_ids = spatial_index_.query_near(x, y, max_dist);
            std::unordered_set<std::string> nearby_set(nearby_ids.begin(), nearby_ids.end());
            
            std::erase_if(results, [&](const auto& item) {
                return !nearby_set.contains(item->id);
            });
            
            // Sort by distance
            std::sort(results.begin(), results.end(),
                [&](const auto& a, const auto& b) {
                    double da = std::hypot(a->x.value_or(0) - x, a->y.value_or(0) - y);
                    double db = std::hypot(b->x.value_or(0) - x, b->y.value_or(0) - y);
                    return da < db;
                });
        }
        
        // Sorting
        results = sort_results(std::move(results), query);
        
        // Pagination
        if (query.limit > 0) {
            size_t start = std::min(query.offset, results.size());
            size_t end = std::min(start + query.limit, results.size());
            results = std::vector<std::shared_ptr<Item>>(
                results.begin() + start, 
                results.begin() + end
            );
        }
        
        return results;
    }
    
    Value find(const Query& query, const Value::Object& options = {}) const {
        auto results = find_items(query);
        
        // Handle special return types
        if (query.count) return static_cast<int64_t>(results.size());
        if (query.ids) {
            Value::Array ids;
            for (const auto& item : results) {
                ids.push_back(item->id);
            }
            return ids;
        }
        if (query.first && !results.empty()) return results[0]->id;
        if (query.last && !results.empty()) return results.back()->id;
        
        // Default: return array of IDs (simplified - would return full items in real code)
        Value::Array result_ids;
        for (const auto& item : results) {
            result_ids.push_back(item->id);
        }
        return result_ids;
    }
    
    // ==================== TRANSACTIONS ====================
    
    std::shared_ptr<Transaction> begin_transaction() {
        WriteLock lock(mutex_);
        
        static uint64_t next_id = 1;
        auto id = next_id++;
        
        auto tx = std::make_shared<Transaction>(
            id,
            [this, id]() { commit_transaction(id); },
            [this, id]() { rollback_transaction(id); }
        );
        
        transaction_stack_.push_back(tx);
        return tx;
    }
    
    void commit_transaction(uint64_t id) {
        WriteLock lock(mutex_);
        
        std::erase_if(transaction_stack_, [id](const auto& tx) {
            return tx->id() == id;
        });
        
        emit("transaction", Value::Object{
            {"type", "commit"},
            {"id", static_cast<int64_t>(id)}
        });
    }
    
    void rollback_transaction(uint64_t id) {
        WriteLock lock(mutex_);
        
        auto it = std::find_if(transaction_stack_.begin(), transaction_stack_.end(),
            [id](const auto& tx) { return tx->id() == id; });
        
        if (it != transaction_stack_.end()) {
            const auto& ops = (*it)->operations();
            for (auto rit = ops.rbegin(); rit != ops.rend(); ++rit) {
                switch (rit->type) {
                    case Transaction::Op::CREATE:
                        items_.erase(rit->id);
                        break;
                    case Transaction::Op::UPDATE:
                        items_[rit->id] = rit->old_item;
                        break;
                    case Transaction::Op::DELETE:
                        items_[rit->id] = rit->new_item;
                        break;
                }
            }
            
            transaction_stack_.erase(it);
        }
        
        emit("transaction", Value::Object{
            {"type", "rollback"},
            {"id", static_cast<int64_t>(id)}
        });
    }
    
    // ==================== EVENTS ====================
    
    size_t on(const std::string& event, std::function<void(const Value&)> callback) {
        WriteLock lock(mutex_);
        listeners_[event].push_back(std::move(callback));
        return listeners_[event].size() - 1;
    }
    
    void off(const std::string& event, size_t index) {
        WriteLock lock(mutex_);
        auto it = listeners_.find(event);
        if (it != listeners_.end() && index < it->second.size()) {
            it->second.erase(it->second.begin() + index);
        }
    }
    
    // ==================== SYNC API ====================
    
    Value export_log(uint64_t since = 0, const Value::Object& filter = {}) const {
        ReadLock lock(mutex_);
        
        Value::Array operations;
        std::optional<ProcessID> filter_pid;
        
        if (auto it = filter.find("processId"); it != filter.end() && it->second.is_string()) {
            filter_pid = *it->second.get<std::string>();
        }
        
        for (const auto& op : journal_) {
            if (op.timestamp > since) {
                if (!filter_pid || op.process_id == *filter_pid) {
                    // Simplified serialization
                    operations.push_back(Value::Object{
                        {"id", op.id},
                        {"processId", op.process_id},
                        {"type", op.type},
                        {"timestamp", static_cast<int64_t>(op.timestamp)}
                    });
                }
            }
        }
        
        return Value::Object{
            {"operations", operations},
            {"vectorClock", Value::Object{}},  // Would serialize vector_clock
            {"lastTimestamp", static_cast<int64_t>(now())},
            {"processId", config_.process_id}
        };
    }
    
    size_t import_log(const Value& log, const Value::Object& options = {}) {
        WriteLock lock(mutex_);
        
        if (!log.is_object()) return 0;
        const auto& log_obj = *log.get<Value::Object>();
        
        std::string strategy = "merge";
        if (auto it = options.find("strategy"); it != options.end() && it->second.is_string()) {
            strategy = *it->second.get<std::string>();
        }
        
        // Merge vector clock (simplified)
        if (auto it = log_obj.find("vectorClock"); it != log_obj.end() && it->second.is_object()) {
            // Would merge properly in real code
        }
        
        size_t applied = 0;
        
        if (auto it = log_obj.find("operations"); it != log_obj.end() && it->second.is_array()) {
            const auto& ops = *it->second.get<Value::Array>();
            
            // Sort by vector clock (simplified)
            std::vector<size_t> indices(ops.size());
            std::iota(indices.begin(), indices.end(), 0);
            
            for (size_t idx : indices) {
                if (!ops[idx].is_object()) continue;
                const auto& op_obj = *ops[idx].get<Value::Object>();
                
                // Get operation type
                auto type_it = op_obj.find("type");
                if (type_it == op_obj.end() || !type_it->second.is_string()) continue;
                std::string op_type = *type_it->second.get<std::string>();
                
                // Get data
                auto data_it = op_obj.find("data");
                if (data_it == op_obj.end()) continue;
                
                // Apply operation (simplified)
                if (op_type == "create") {
                    // Would create item
                    applied++;
                } else if (op_type == "update") {
                    // Would update item
                    applied++;
                } else if (op_type == "delete") {
                    // Would delete item
                    applied++;
                }
            }
        }
        
        return applied;
    }
    
    size_t on_journal(std::function<void(const Operation&)> callback) {
        WriteLock lock(mutex_);
        journal_listeners_.push_back(std::move(callback));
        return journal_listeners_.size() - 1;
    }
    
    void off_journal(size_t index) {
        WriteLock lock(mutex_);
        if (index < journal_listeners_.size()) {
            journal_listeners_.erase(journal_listeners_.begin() + index);
        }
    }
    
    Value checkpoint() {
        WriteLock lock(mutex_);
        
        // Create snapshot
        Value::Object snapshot;
        for (const auto& [id, item] : items_) {
            // Simplified serialization
            snapshot[id] = item->id;
        }
        
        Operation checkpoint_op;
        checkpoint_op.type = "checkpoint";
        checkpoint_op.id = "checkpoint-" + std::to_string(now());
        checkpoint_op.process_id = config_.process_id;
        checkpoint_op.vector_clock = snapshot_clock();
        checkpoint_op.data = Value::Object{{"snapshot", snapshot}};
        checkpoint_op.timestamp = now();
        
        journal_.push_back(checkpoint_op);
        
        // Prune journal (keep only after checkpoint)
        auto it = std::find_if(journal_.begin(), journal_.end(),
            [&](const auto& op) { return op.id == checkpoint_op.id; });
        if (it != journal_.end()) {
            journal_.erase(journal_.begin(), it);
        }
        
        return checkpoint_op.id;
    }
    
    void clear() {
        WriteLock lock(mutex_);
        items_.clear();
        type_index_.clear();
        // spatial_index_ would need clear method
        journal_.clear();
        emit("clear", Value{});
    }
    
    bool delete_one(const std::string& id, const Value::Object& options) {
        auto it = items_.find(id);
        if (it == items_.end()) return false;
        
        auto item = it->second;
        items_.erase(it);
        update_indexes("remove", item);
        
        auto silent = options.find("silent");
        if (silent == options.end() || !silent->second.is_bool() || !silent->second.get<bool>()) {
            emit("delete", item->id);
            emit("change", Value::Object{{"type", "delete"}, {"item", item->id}});
        }
        
        record_operation("delete", Value::Object{{"id", id}});
        
        return true;
    }
    
    // Debug access
    size_t size() const {
        ReadLock lock(mutex_);
        return items_.size();
    }
    
    size_t journal_size() const {
        ReadLock lock(mutex_);
        return journal_.size();
    }
};

// ==================== FACTORY FUNCTION ====================

inline Store create_store(const Config& config = {}) {
    return Store(config);
}

} // namespace tinyset
